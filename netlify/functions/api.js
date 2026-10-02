const serverless = require('serverless-http');
const { server, initializeDatabase } = require('../../server.js');

const handler = serverless(server);
const functionPath = '/.netlify/functions/api';

function normalizeFunctionEvent(event) {
  if (!event.path?.startsWith(functionPath)) return event;
  const suffix = event.path.slice(functionPath.length);
  return { ...event, path: `/api${suffix}` };
}

exports.handler = async (event, context) => {
  await initializeDatabase();
  return handler(normalizeFunctionEvent(event), context);
};

exports.normalizeFunctionEvent = normalizeFunctionEvent;