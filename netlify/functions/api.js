const serverless = require('serverless-http');
const { server, initializeDatabase } = require('../../server.js');

const handler = serverless(server);
const functionPath = '/.netlify/functions/api';

exports.handler = async (event, context) => {
  await initializeDatabase();
  let normalizedEvent = event;
  if (event.path?.startsWith(functionPath)) {
    normalizedEvent = { ...event, path: `/api${event.path.slice(functionPath.length)}` };
  }
  return handler(normalizedEvent, context);
};