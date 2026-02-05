const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

// Import routes and services
const workflowRoutes = require('./routes/workflows');
const { router: runRoutes, setExecutor } = require('./routes/runs');
const { WorkflowExecutor } = require('./services/executor');
const { AVAILABLE_MODELS } = require('./services/unbound');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API Routes
app.use('/api/workflows', workflowRoutes);
app.use('/api/runs', runRoutes);

// Get available models
app.get('/api/models', (req, res) => {
  res.json(AVAILABLE_MODELS);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
    } catch (e) {
      console.error('Invalid WebSocket message:', e);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
  
  // Send welcome message
  ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
});

// Initialize executor with WebSocket server
const apiKey = process.env.UNBOUND_API_KEY || '';
const executor = new WorkflowExecutor(apiKey, wss);
setExecutor(executor);

if (!apiKey) {
  console.warn('⚠️  Warning: UNBOUND_API_KEY not set. LLM calls will fail.');
  console.warn('   Set it with: set UNBOUND_API_KEY=your_api_key (Windows)');
}

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       🚀 Agentic Workflow Builder - Backend Server        ║
╠═══════════════════════════════════════════════════════════╣
║  REST API:    http://localhost:${PORT}/api                   ║
║  WebSocket:   ws://localhost:${PORT}/ws                      ║
║  Frontend:    http://localhost:${PORT}                       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, wss };
