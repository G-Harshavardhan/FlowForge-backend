const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/schema');

const router = express.Router();

// Get all workflows
router.get('/', (req, res) => {
  try {
    const workflows = db.getAllWorkflows();
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single workflow with steps
router.get('/:id', (req, res) => {
  try {
    const workflow = db.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const steps = db.getWorkflowSteps(req.params.id);
    res.json({ ...workflow, steps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create workflow
router.post('/', (req, res) => {
  try {
    const { name, description, steps = [] } = req.body;
    
    const workflow = db.createWorkflow(name, description);
    
    // Insert steps if provided
    steps.forEach((step, index) => {
      db.addStep(workflow.id, index, step);
    });
    
    const createdSteps = db.getWorkflowSteps(workflow.id);
    res.status(201).json({ ...workflow, steps: createdSteps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update workflow
router.put('/:id', (req, res) => {
  try {
    const { name, description, steps } = req.body;
    
    const workflow = db.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const updated = db.updateWorkflow(
      req.params.id, 
      name || workflow.name, 
      description !== undefined ? description : workflow.description
    );
    
    // If steps are provided, replace all steps
    if (steps && Array.isArray(steps)) {
      db.deleteWorkflowSteps(req.params.id);
      
      steps.forEach((step, index) => {
        db.addStep(req.params.id, index, step);
      });
    }
    
    const updatedSteps = db.getWorkflowSteps(req.params.id);
    res.json({ ...updated, steps: updatedSteps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete workflow
router.delete('/:id', (req, res) => {
  try {
    const deleted = db.deleteWorkflow(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json({ message: 'Workflow deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export workflow as JSON
router.get('/:id/export', (req, res) => {
  try {
    const workflow = db.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    const steps = db.getWorkflowSteps(req.params.id);
    
    const exportData = {
      name: workflow.name,
      description: workflow.description,
      steps: steps.map(s => ({
        name: s.name,
        model: s.model,
        prompt: s.prompt,
        criteria_type: s.criteria_type,
        criteria_value: s.criteria_value,
        retry_limit: s.retry_limit,
        context_mode: s.context_mode
      }))
    };
    
    res.setHeader('Content-Disposition', `attachment; filename="${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json"`);
    res.json(exportData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import workflow from JSON
router.post('/import', (req, res) => {
  try {
    const { name, description, steps } = req.body;
    
    if (!name || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'Invalid workflow format' });
    }
    
    const workflow = db.createWorkflow(name, description);
    
    steps.forEach((step, index) => {
      db.addStep(workflow.id, index, step);
    });
    
    const createdSteps = db.getWorkflowSteps(workflow.id);
    res.status(201).json({ ...workflow, steps: createdSteps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
