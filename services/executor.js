/**
 * Workflow Execution Engine
 * Handles sequential step execution with retries, context passing, and progress tracking
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');
const { evaluateCriteria, extractContext } = require('./criteria');
const { UnboundService } = require('./unbound');

class WorkflowExecutor {
  constructor(apiKey, wsServer = null) {
    this.unbound = new UnboundService(apiKey);
    this.wsServer = wsServer;
    this.activeRuns = new Map();
  }

  /**
   * Start executing a workflow
   * @param {string} workflowId - Workflow to execute
   * @returns {Promise<string>} - Run ID
   */
  async execute(workflowId) {
    // Get workflow and steps
    const workflow = db.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const steps = db.getWorkflowSteps(workflowId);
    if (steps.length === 0) {
      throw new Error('Workflow has no steps');
    }

    // Create run record
    const run = db.createRun(workflowId);

    // Create step execution records
    steps.forEach(step => {
      db.createStepExecution(run.id, step.id);
    });

    // Track active run
    this.activeRuns.set(run.id, { workflowId, status: 'running' });

    // Execute asynchronously
    this.executeSteps(run.id, steps).catch(error => {
      console.error('Execution error:', error);
      this.failRun(run.id, error.message);
    });

    return run.id;
  }

  /**
   * Execute steps sequentially
   */
  async executeSteps(runId, steps) {
    let previousContext = '';
    let totalCost = 0;
    let totalTokens = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Get step execution record
      const stepExec = db.getStepExecution(runId, step.id);

      // Update step status to running
      db.updateStepExecution(stepExec.id, {
        status: 'running',
        started_at: new Date().toISOString(),
        input_context: previousContext
      });

      this.broadcast(runId, {
        type: 'step_started',
        stepId: step.id,
        stepIndex: i,
        stepName: step.name
      });

      // Try executing with retries
      let passed = false;
      let lastOutput = '';
      let lastError = '';
      let attempts = 0;
      let stepCost = 0;
      let stepTokens = 0;

      while (!passed && attempts < step.retry_limit) {
        attempts++;
        
        this.broadcast(runId, {
          type: 'step_attempt',
          stepId: step.id,
          attempt: attempts,
          maxAttempts: step.retry_limit
        });

        try {
          // Prepare prompt - substitute {context} placeholder with previous context
          let prompt = step.prompt;
          if (previousContext && prompt.includes('{context}')) {
            prompt = prompt.replace(/\{context\}/g, previousContext);
          }
          
          // Call LLM (don't pass context separately if already substituted)
          const contextToPass = prompt.includes(previousContext) ? '' : previousContext;
          const result = await this.unbound.call(prompt, step.model, contextToPass);
          lastOutput = result.content;
          stepCost += result.cost;
          stepTokens += result.tokens.total;

          this.broadcast(runId, {
            type: 'step_response',
            stepId: step.id,
            output: lastOutput,
            tokens: result.tokens,
            cost: result.cost
          });

          // Evaluate criteria
          const llmEvaluator = step.criteria_type === 'llm' 
            ? (evalPrompt) => this.unbound.call(evalPrompt, 'kimi-k2-instruct-0905')
            : null;

          const evaluation = await evaluateCriteria(
            lastOutput, 
            step.criteria_type, 
            step.criteria_value,
            llmEvaluator
          );

          this.broadcast(runId, {
            type: 'step_evaluated',
            stepId: step.id,
            passed: evaluation.passed,
            reason: evaluation.reason
          });

          if (evaluation.passed) {
            passed = true;
          } else {
            lastError = evaluation.reason;
          }

        } catch (error) {
          lastError = error.message;
          this.broadcast(runId, {
            type: 'step_error',
            stepId: step.id,
            error: error.message
          });
        }

        // Brief delay between retries
        if (!passed && attempts < step.retry_limit) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      totalCost += stepCost;
      totalTokens += stepTokens;

      // Update step execution record
      db.updateStepExecution(stepExec.id, {
        status: passed ? 'passed' : 'failed',
        attempts,
        output: lastOutput,
        error: passed ? null : lastError,
        tokens_used: stepTokens,
        cost: stepCost,
        completed_at: new Date().toISOString()
      });

      if (passed) {
        // Extract context for next step
        previousContext = extractContext(lastOutput, step.context_mode);
        
        this.broadcast(runId, {
          type: 'step_completed',
          stepId: step.id,
          stepIndex: i,
          passed: true
        });
      } else {
        // Step failed after all retries
        this.broadcast(runId, {
          type: 'step_completed',
          stepId: step.id,
          stepIndex: i,
          passed: false,
          error: lastError
        });

        // Fail the entire run
        this.failRun(runId, `Step "${step.name}" failed: ${lastError}`, totalCost, totalTokens);
        return;
      }
    }

    // All steps completed successfully
    this.completeRun(runId, totalCost, totalTokens);
  }

  /**
   * Complete a run successfully
   */
  completeRun(runId, totalCost, totalTokens) {
    db.updateRun(runId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      total_cost: totalCost,
      total_tokens: totalTokens
    });

    this.activeRuns.delete(runId);

    this.broadcast(runId, {
      type: 'run_completed',
      runId,
      status: 'completed',
      totalCost,
      totalTokens
    });
  }

  /**
   * Fail a run
   */
  failRun(runId, error, totalCost = 0, totalTokens = 0) {
    db.updateRun(runId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      total_cost: totalCost,
      total_tokens: totalTokens
    });

    this.activeRuns.delete(runId);

    this.broadcast(runId, {
      type: 'run_completed',
      runId,
      status: 'failed',
      error,
      totalCost,
      totalTokens
    });
  }

  /**
   * Broadcast event to WebSocket clients
   */
  broadcast(runId, event) {
    if (!this.wsServer) return;

    const message = JSON.stringify({ runId, ...event, timestamp: Date.now() });
    
    this.wsServer.clients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(message);
      }
    });
  }

  /**
   * Get run status
   */
  getRunStatus(runId) {
    return this.activeRuns.get(runId) || null;
  }
}

module.exports = { WorkflowExecutor };
