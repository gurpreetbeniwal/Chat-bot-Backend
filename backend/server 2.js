require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dialogflow = require('@google-cloud/dialogflow');
const mongoose = require('mongoose'); // Added Mongoose

const app = express();
const server = http.createServer(app);

// 1. MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

// 2. Define the Chat Schema & Model
const chatSchema = new mongoose.Schema({
  userId: String,
  sender: String, // 'user' or 'bot'
  text: String,
  timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Dialogflow Setup
const sessionClient = new dialogflow.SessionsClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const projectId = process.env.DIALOGFLOW_PROJECT_ID;

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // NEW: Fetch Chat History for returning users
  socket.on('getHistory', async (userId) => {
    try {
      // Find all messages for this user, sorted by oldest to newest
      const history = await Chat.find({ userId: userId }).sort({ timestamp: 1 });
      socket.emit('chatHistory', history);
    } catch (error) {
      console.error('Error fetching history:', error);
    }
  });

  // Listen for messages from the React frontend
  socket.on('sendMessage', async (data) => {
    const { userId, text } = data;
    
    try {
      // 3. Save the USER'S message to MongoDB
      const userMessage = new Chat({ userId, sender: 'user', text });
      await userMessage.save();

      // Create Dialogflow session
      const sessionPath = sessionClient.projectAgentSessionPath(projectId, userId);
      const request = {
        session: sessionPath,
        queryInput: {
          text: { text: text, languageCode: 'en-US' },
        },
      };

      // Send to Dialogflow
      const responses = await sessionClient.detectIntent(request);
      const aiReply = responses[0].queryResult.fulfillmentText;

      // 4. Save the BOT'S reply to MongoDB
      const botMessage = new Chat({ userId, sender: 'bot', text: aiReply });
      await botMessage.save();

      // Send the AI's reply back to the React client
      socket.emit('receiveMessage', {
        sender: 'bot',
        text: aiReply,
        timestamp: botMessage.timestamp
      });
      
    } catch (error) {
      console.error('Dialogflow Error:', error);
      socket.emit('receiveMessage', { sender: 'bot', text: 'Sorry, I am having trouble connecting to the server.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(3001, () => {
  console.log('Server is running on port 3001');
});