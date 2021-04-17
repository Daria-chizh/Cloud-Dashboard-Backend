const http = require('http');
const Koa = require('koa');
const cors = require('@koa/cors');
const ws = require('ws');
const uuid = require('uuid');

const app = new Koa();
app.use(cors());

const httpServer = http.createServer(app.callback()).listen(process.env.PORT || 5555, () => console.log('Server is working'));
const wsServer = new ws.Server({ server: httpServer });

const instances = [
  {
    id: '1',
    state: 'running',
  },
  {
    id: '2',
    state: 'stopped',
  },
];

function formatDateElement(dateElement) {
  return String(dateElement).padStart(2, '0');
}

function renderCreatedTime() {
  const date = new Date();
  const timePart = `${formatDateElement(date.getHours())}:${formatDateElement(date.getMinutes())}:${formatDateElement(date.getSeconds())}`;
  const shortYear = date.getFullYear().toString().substr(2, 2);
  const datePart = `${formatDateElement(date.getDate())}.${formatDateElement(date.getMonth() + 1)}.${shortYear}`;
  return `${timePart} ${datePart}`;
}

const sendMessageToClient = (client, message) => client.send(JSON.stringify(message));
const sendMessageToAllClients = (message) => {
  wsServer.clients.forEach((client) => sendMessageToClient(client, message));
};

const processMessage = (action, id) => {
  if (action === 'create') {
    const instance = { id, state: 'stopped' };
    instances.push(instance);
    sendMessageToAllClients({ type: 'created', id, ts: renderCreatedTime() });
    return;
  }

  const instanceIdx = instances.findIndex((item) => item.id === id);
  if (instanceIdx === -1) {
    sendMessageToAllClients({ type: 'error', id, ts: renderCreatedTime() });
    return;
  }

  switch (action) {
    case 'stop':
      instances[instanceIdx].state = 'stopped';
      sendMessageToAllClients({ type: 'stopped', id, ts: renderCreatedTime() });
      return;
    case 'start':
      instances[instanceIdx].state = 'running';
      sendMessageToAllClients({ type: 'started', id, ts: renderCreatedTime() });
      return;
    case 'remove':
      instances.splice(instanceIdx, 1);
      sendMessageToAllClients({ type: 'removed', id, ts: renderCreatedTime() });
      break;
    default:
  }
};

wsServer.on('connection', (client) => {
  client.on('message', (rawMsg) => {
    try {
      const msg = JSON.parse(rawMsg);
      const { action } = msg;
      let { id } = msg;

      if (!id) {
        if (action !== 'create') {
          throw Error('Missing ID');
        }
        id = uuid.v4();
      }

      sendMessageToAllClients({
        type: 'received',
        action,
        id,
        ts: renderCreatedTime(),
      });

      setTimeout(() => processMessage(action, id), 5000);
    } catch (err) {
      console.log('Error', err);
    }
  });

  sendMessageToClient(client, { type: 'initial', instances });
});
