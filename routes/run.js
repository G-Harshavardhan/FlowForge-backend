const express = require('express');
const db = require('../db/schema');

const router = express.Router();

// Executor will be set by server.js
let executor = null;

function setExecutor(exec) {
  executor = exec;
}

// Get all runs
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = db.getAllRuns(limit, offset);
    res.json({ ...result, limit, offset });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single run with step executions
router.get('/:id', (req, res) => {
  try {
    const run = db.getRun(req.params.id);
    
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    const stepExecutions = db.getRunStepExecutions(req.params.id);
    res.json({ ...run, step_executions: stepExecutions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start a workflow run
router.post('/start/:workflowId', async (req, res) => {
  try {
    if (!executor) {
      return res.status(500).json({ error: 'Executor not initialized' });
    }
    
    const runId = await executor.execute(req.params.workflowId);
    const run = db.getRun(runId);
    res.status(201).json(run);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get run statistics
router.get('/stats/summary', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, setExecutor };
