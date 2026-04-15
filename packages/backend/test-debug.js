const request = require('supertest');
const express = require('express');
const { setupSessionMiddleware } = require('./dist/middleware/session');
const { setupManagementRoutes } = require('./dist/routes/management');
const { errorHandler } = require('./dist/middleware/errorHandler');

const app = express();
app.use(express.json());
setupSessionMiddleware(app);
setupManagementRoutes(app);
app.use(errorHandler);

request(app)
  .post('/api/guilds/111111111111111111/commands')
  .set('Cookie', ['sessionId=valid_session_id'])
  .send({ name: 'test', description: 'test desc' })
  .end((err, res) => {
    console.log('Status:', res?.status);
    console.log('Body:', JSON.stringify(res?.body, null, 2));
    if (err) console.log('Error:', err.message);
  });
