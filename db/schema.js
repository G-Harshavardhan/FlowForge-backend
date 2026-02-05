const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, '..', 'data.json');

// Initialize database structure
function initializeDB() {
  if (!fs.existsSync(dbPath)) {
    const initialData = {
      workflows: [],
      steps: [],
      runs: [],
      step_executions: []
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

let data = initializeDB();

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Database operations wrapper
const db = {
  // Workflow operations
  getAllWorkflows() {
    return data.workflows.map(w => {
      const stepCount = data.steps.filter(s => s.workflow_id === w.id).length;
      const runCount = data.runs.filter(r => r.workflow_id === w.id).length;
      return { ...w, step_count: stepCount, run_count: runCount };
    }).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  },

  getWorkflow(id) {
    return data.workflows.find(w => w.id === id) || null;
  },

  createWorkflow(name, description) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const workflow = { id, name, description: description || '', created_at: now, updated_at: now };
    data.workflows.push(workflow);
    save();
    return workflow;
  },

  updateWorkflow(id, name, description) {
    const index = data.workflows.findIndex(w => w.id === id);
    if (index === -1) return null;
    data.workflows[index] = {
      ...data.workflows[index],
      name,
      description,
      updated_at: new Date().toISOString()
    };
    save();
    return data.workflows[index];
  },

  deleteWorkflow(id) {
    const initialLength = data.workflows.length;
    data.workflows = data.workflows.filter(w => w.id !== id);
    data.steps = data.steps.filter(s => s.workflow_id !== id);
    data.runs = data.runs.filter(r => r.workflow_id !== id);
    save();
    return initialLength !== data.workflows.length;
  },

  // Step operations
  getWorkflowSteps(workflowId) {
    return data.steps
      .filter(s => s.workflow_id === workflowId)
      .sort((a, b) => a.order_index - b.order_index);
  },

  addStep(workflowId, orderIndex, stepData) {
    const id = uuidv4();
    const step = {
      id,
      workflow_id: workflowId,
      order_index: orderIndex,
      name: stepData.name || `Step ${orderIndex + 1}`,
      model: stepData.model || 'kimi-k2-instruct-0905',
      prompt: stepData.prompt || '',
      criteria_type: stepData.criteria_type || 'always',
      criteria_value: stepData.criteria_value || '',
      retry_limit: stepData.retry_limit || 3,
      context_mode: stepData.context_mode || 'full'
    };
    data.steps.push(step);
    save();
    return step;
  },

  deleteWorkflowSteps(workflowId) {
    data.steps = data.steps.filter(s => s.workflow_id !== workflowId);
    save();
  },

  // Run operations
  getAllRuns(limit = 50, offset = 0) {
    const sorted = data.runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    const runs = sorted.slice(offset, offset + limit).map(r => {
      const workflow = data.workflows.find(w => w.id === r.workflow_id);
      const totalSteps = data.step_executions.filter(se => se.run_id === r.id).length;
      const passedSteps = data.step_executions.filter(se => se.run_id === r.id && se.status === 'passed').length;
      return { ...r, workflow_name: workflow?.name || 'Unknown', total_steps: totalSteps, passed_steps: passedSteps };
    });
    return { runs, total: data.runs.length };
  },

  getRun(id) {
    const run = data.runs.find(r => r.id === id);
    if (!run) return null;
    const workflow = data.workflows.find(w => w.id === run.workflow_id);
    return { ...run, workflow_name: workflow?.name || 'Unknown' };
  },

  createRun(workflowId) {
    const id = uuidv4();
    const run = { id, workflow_id: workflowId, status: 'running', started_at: new Date().toISOString(), completed_at: null, total_cost: 0, total_tokens: 0 };
    data.runs.push(run);
    save();
    return run;
  },

  updateRun(id, updates) {
    const index = data.runs.findIndex(r => r.id === id);
    if (index === -1) return null;
    data.runs[index] = { ...data.runs[index], ...updates };
    save();
    return data.runs[index];
  },

  // Step execution operations
  createStepExecution(runId, stepId) {
    const id = uuidv4();
    const execution = { id, run_id: runId, step_id: stepId, status: 'pending', attempts: 0, input_context: null, output: null, error: null, tokens_used: 0, cost: 0, started_at: null, completed_at: null };
    data.step_executions.push(execution);
    save();
    return execution;
  },

  getStepExecution(runId, stepId) {
    return data.step_executions.find(se => se.run_id === runId && se.step_id === stepId) || null;
  },

  getRunStepExecutions(runId) {
    const executions = data.step_executions.filter(se => se.run_id === runId);
    return executions.map(se => {
      const step = data.steps.find(s => s.id === se.step_id);
      return { ...se, step_name: step?.name || 'Unknown', model: step?.model || 'Unknown', prompt: step?.prompt || '', criteria_type: step?.criteria_type, criteria_value: step?.criteria_value };
    }).sort((a, b) => {
      const stepA = data.steps.find(s => s.id === a.step_id);
      const stepB = data.steps.find(s => s.id === b.step_id);
      return (stepA?.order_index || 0) - (stepB?.order_index || 0);
    });
  },

  updateStepExecution(id, updates) {
    const index = data.step_executions.findIndex(se => se.id === id);
    if (index === -1) return null;
    data.step_executions[index] = { ...data.step_executions[index], ...updates };
    save();
    return data.step_executions[index];
  },

  // Stats
  getStats() {
    const totalRuns = data.runs.length;
    const completedRuns = data.runs.filter(r => r.status === 'completed').length;
    const failedRuns = data.runs.filter(r => r.status === 'failed').length;
    const totalCost = data.runs.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const totalTokens = data.runs.reduce((sum, r) => sum + (r.total_tokens || 0), 0);
    return { total_runs: totalRuns, completed_runs: completedRuns, failed_runs: failedRuns, total_cost: totalCost, total_tokens: totalTokens, avg_cost_per_run: totalRuns > 0 ? totalCost / totalRuns : 0 };
  }
};

module.exports = db;

