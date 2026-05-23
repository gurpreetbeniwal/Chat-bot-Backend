require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const dialogflow = require('@google-cloud/dialogflow').v2beta1;
const mongoose = require('mongoose');
const fs = require('fs');

console.log("=================================");
console.log("🚀 SERVER STARTING");
console.log("=================================");

console.log("📌 MONGO_URI:");
console.log(process.env.MONGO_URI);

console.log("📌 GOOGLE_APPLICATION_CREDENTIALS:");
console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS);

console.log("📌 DIALOGFLOW_PROJECT_ID:");
console.log(process.env.DIALOGFLOW_PROJECT_ID);

console.log("=================================");

const app = express();

app.use(cors());
app.use(express.static('public'));

app.get('/status', (req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  const isDialogflowInit = !!sessionClient;
  res.json({
    status: isMongoConnected && isDialogflowInit ? 'active' : 'degraded',
    connected: true,
    mongo: isMongoConnected ? 'connected' : 'disconnected',
    dialogflow: isDialogflowInit ? 'connected' : 'disconnected'
  });
});

const server = http.createServer(app);

// ==========================================
// 1. MONGODB SETUP
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// ✨ UPDATED: Chat History Schema (Now saves all 3 custom cards!)
const chatSchema = new mongoose.Schema({
  userId: String,
  sender: String,
  text: String,
  buttons: [String],
  courseCategories: Array,
  feeCard: Object,
  durationCard: Object,
  syllabusCard: Object,
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

// Admission Data Schema
const admissionSchema = new mongoose.Schema({
  userId: String,
  name: String,
  email: String,
  phone: String,
  course: String,
  status: { type: String, default: 'Pending' },
  timestamp: { type: Date, default: Date.now }
});

const Admission = mongoose.model('Admission', admissionSchema);

// Course Information Schema
const courseInfoSchema = new mongoose.Schema({
  courseName: String,
  totalFee: String,
  semesters: String,
  feePerSemester: String
});

const CourseInfo = mongoose.model('CourseInfo', courseInfoSchema);

// ==========================================
// 2. SOCKET & DIALOGFLOW SETUP
// ==========================================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ==========================================
// DIALOGFLOW DEBUG
// ==========================================
console.log("🤖 Initializing Dialogflow...");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {

  console.log("❌ GOOGLE_APPLICATION_CREDENTIALS IS UNDEFINED");

} else {

  console.log("📂 Checking Dialogflow Key File...");

  if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {

    console.log("✅ Dialogflow Key File Found");

  } else {

    console.log("❌ Dialogflow Key File NOT FOUND");
    console.log("📌 Expected Path:");
    console.log(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  }
}

let sessionClient;

try {

  sessionClient = new dialogflow.SessionsClient({
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  console.log("✅ Dialogflow Client Initialized");

} catch (error) {

  console.log("❌ Dialogflow Initialization Failed");
  console.error(error);

}

const projectId = process.env.DIALOGFLOW_PROJECT_ID;

// ==========================================
// 3. REAL-TIME CHAT LOGIC
// ==========================================
io.on('connection', (socket) => {

  console.log(`✅ User connected: ${socket.id}`);

  // ==========================================
  // FETCH CHAT HISTORY
  // ==========================================
  socket.on('getHistory', async (userId) => {

    try {

      console.log("📜 Fetching Chat History For:", userId);

      const history = await Chat.find({
        userId: userId
      }).sort({ timestamp: 1 });

      console.log("✅ Chat History Loaded");

      socket.emit('chatHistory', history);

    } catch (error) {

      console.log("❌ Error Fetching History");
      console.error(error);

    }
  });

  // ==========================================
  // SEND MESSAGE
  // ==========================================
  socket.on('sendMessage', async (data) => {

    const { userId, text } = data;

    console.log("=================================");
    console.log("📨 NEW MESSAGE");
    console.log("=================================");
    console.log("👤 USER ID:", userId);
    console.log("💬 MESSAGE:", text);

    try {

      // ==========================================
      // SAVE USER MESSAGE
      // ==========================================
      console.log("💾 Saving User Message To MongoDB...");

      const userMessage = new Chat({
        userId,
        sender: 'user',
        text
      });

      await userMessage.save();

      console.log("✅ User Message Saved");

      // ==========================================
      // DIALOGFLOW REQUEST
      // ==========================================
      console.log("🤖 Sending Request To Dialogflow...");
      console.log("📌 PROJECT ID:", projectId);

      const sessionPath = sessionClient.projectAgentSessionPath(
        projectId,
        userId
      );

      console.log("📌 SESSION PATH:");
      console.log(sessionPath);

      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: text,
            languageCode: 'en-US'
          },
        },
        queryParams: {
          knowledgeBaseNames: [
            "projects/edtech-chatbot-493507/knowledgeBases/MTc5ODI4NDkyNjAyNzM1MzI5Mjk"
          ]
        }
      };

      // ==========================================
      // DETECT INTENT
      // ==========================================
      console.log("📤 Calling detectIntent()...");

      const responses = await sessionClient.detectIntent(request);

      console.log("✅ Dialogflow Response Received");

      const queryResult = responses[0].queryResult;

      console.log(
        "🎯 INTENT:",
        queryResult.intent
          ? queryResult.intent.displayName
          : "NO INTENT"
      );

      console.log("📝 BOT RESPONSE:");
      console.log(queryResult.fulfillmentText);

      console.log(
        "=== DIALOGFLOW INTENT MATCHED ===",
        queryResult.intent
          ? queryResult.intent.displayName
          : "None"
      );

      // ==========================================
      // RESPONSE PROCESSING
      // ==========================================
      let aiReply = queryResult.fulfillmentText;

      let buttonArray = [];
      let courseCategories = null;
      let feeCard = null;
      let durationCard = null;
      let syllabusCard = null;

      // ==========================================
      // CUSTOM PAYLOADS
      // ==========================================
      const messages = queryResult.fulfillmentMessages;

      if (messages && messages.length > 0) {

        messages.forEach(msg => {

          // BUTTONS
          if (
            msg.payload &&
            msg.payload.fields &&
            msg.payload.fields.isButtons
          ) {

            console.log("🔘 Buttons Payload Found");

            const btnList =
              msg.payload.fields.buttons.listValue.values;

            buttonArray = btnList.map(b => b.stringValue);
          }

          // COURSE CATEGORIES
          if (
            msg.payload &&
            msg.payload.fields &&
            msg.payload.fields.isCourseCategories
          ) {

            console.log("📚 Course Categories Payload Found");

            courseCategories = [];

            const categoriesData =
              msg.payload.fields.categories.listValue.values;

            categoriesData.forEach(cat => {

              const catFields = cat.structValue.fields;

              const heading =
                catFields.heading.stringValue;

              const courses =
                catFields.courses.listValue.values.map(
                  c => c.stringValue
                );

              courseCategories.push({
                heading: heading,
                courses: courses
              });
            });
          }
        });
      }

      // ==========================================
      // KNOWLEDGE BASE
      // ==========================================
      if (
        queryResult.knowledgeAnswers &&
        queryResult.knowledgeAnswers.answers &&
        queryResult.knowledgeAnswers.answers.length > 0
      ) {

        console.log("📚 Knowledge Base Match Found!");

        aiReply =
          queryResult.knowledgeAnswers.answers[0].answer;
      }

      // ==========================================
      // ADMISSION FORM
      // ==========================================
      if (
        queryResult.intent &&
        queryResult.intent.displayName === 'Admission_Form'
      ) {

        if (queryResult.allRequiredParamsPresent === true) {

          console.log("🎓 Admission Form Completed");

          const params = queryResult.parameters.fields;

          const newStudentName =
            params.student_name.stringValue;

          const newStudentEmail =
            params.student_email.stringValue;

          const newStudentPhone =
            params.student_phone.stringValue;

          const newCourse =
            params.desired_course.stringValue;

          console.log(
            `🎓 Saving New Admission For: ${newStudentName}`
          );

          const newApplication = new Admission({
            userId: userId,
            name: newStudentName,
            email: newStudentEmail,
            phone: newStudentPhone,
            course: newCourse
          });

          await newApplication.save();

          console.log("✅ Admission Saved");
        }
      }

      // ==========================================
      // COURSE FEES
      // ==========================================
      if (
        queryResult.intent &&
        queryResult.intent.displayName === 'Course_Details_Fee'
      ) {

        const requestedCourse =
          queryResult.parameters.fields.requested_course.stringValue;

        console.log(`💰 Looking Up Fees For: ${requestedCourse}`);

        const courseData =
          await CourseInfo.findOne({
            courseName: requestedCourse
          });

        if (courseData) {

          console.log("✅ Course Fee Data Found");

          aiReply =
            `Here is the detailed fee structure for the ${requestedCourse} program:`;

          feeCard = {
            course: courseData.courseName,
            totalFee: courseData.totalFee,
            semesters: courseData.semesters,
            feePerSemester: courseData.feePerSemester
          };

        } else {

          console.log("❌ Course Fee Data Not Found");

          aiReply =
            `I am sorry, I am currently updating the fee database for ${requestedCourse}. Please contact the admissions office for immediate assistance.`;
        }
      }

      // ==========================================
      // COURSE DURATION
      // ==========================================
      else if (
        queryResult.intent &&
        queryResult.intent.displayName === 'Course_Details_Duration'
      ) {

        const requestedCourse =
          queryResult.parameters.fields.requested_course.stringValue;

        console.log(`⏱ Looking Up Duration For: ${requestedCourse}`);

        const courseData =
          await CourseInfo.findOne({
            courseName: requestedCourse
          });

        if (courseData) {

          console.log("✅ Duration Data Found");

          aiReply =
            `Here is the duration information for the ${requestedCourse} program:`;

          const years =
            (parseInt(courseData.semesters) / 2) + " Years";

          durationCard = {
            course: courseData.courseName,
            semesters: courseData.semesters,
            years: years
          };

        } else {

          console.log("❌ Duration Data Not Found");

          aiReply =
            `I am sorry, I couldn't find the duration data for ${requestedCourse}.`;
        }
      }

      // ==========================================
      // SYLLABUS
      // ==========================================
      else if (
        queryResult.intent &&
        queryResult.intent.displayName === 'Course_Details_Syllabus'
      ) {

        const requestedCourse =
          queryResult.parameters.fields.requested_course.stringValue;

        console.log(`📚 Generating Syllabus Link For: ${requestedCourse}`);

        const urlSlug =
          requestedCourse
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/\./g, '');

        const dynamicUrl =
          `https://university.in/courses/${urlSlug}`;

        aiReply =
          `You can view and download the full syllabus for ${requestedCourse} from our official portal.`;

        syllabusCard = {
          course: requestedCourse,
          url: dynamicUrl
        };
      }

      // ==========================================
      // FALLBACK
      // ==========================================
      if (
        !aiReply &&
        buttonArray.length === 0 &&
        (!courseCategories || courseCategories.length === 0) &&
        !feeCard &&
        !durationCard &&
        !syllabusCard
      ) {

        console.log("⚠ Empty AI Reply Fallback Triggered");

        aiReply =
          "I am sorry, I couldn't process that. Could you try asking in a different way?";
      }

      // ==========================================
      // SAVE BOT MESSAGE
      // ==========================================
      console.log("💾 Saving Bot Reply...");

      const botMessage = new Chat({
        userId,
        sender: 'bot',
        text: aiReply,
        buttons:
          buttonArray.length > 0
            ? buttonArray
            : undefined,
        courseCategories:
          courseCategories &&
          courseCategories.length > 0
            ? courseCategories
            : undefined,
        feeCard:
          feeCard
            ? feeCard
            : undefined,
        durationCard:
          durationCard
            ? durationCard
            : undefined,
        syllabusCard:
          syllabusCard
            ? syllabusCard
            : undefined
      });

      await botMessage.save();

      console.log("✅ Bot Reply Saved");

      // ==========================================
      // SEND RESPONSE
      // ==========================================
      socket.emit('receiveMessage', {
        sender: 'bot',
        text: aiReply,
        buttons: buttonArray,
        courseCategories: courseCategories,
        feeCard: feeCard,
        durationCard: durationCard,
        syllabusCard: syllabusCard,
        timestamp: botMessage.timestamp
      });

      console.log("✅ Response Sent To Frontend");

    } catch (error) {

      console.log("=================================");
      console.log("❌ FULL SERVER ERROR");
      console.log("=================================");

      console.error(error);

      console.log("📌 ERROR MESSAGE:");
      console.log(error.message);

      if (error.code) {

        console.log("📌 ERROR CODE:");
        console.log(error.code);
      }

      if (error.details) {

        console.log("📌 ERROR DETAILS:");
        console.log(error.details);
      }

      console.log("=================================");

      socket.emit('receiveMessage', {
        sender: 'bot',
        text: 'Sorry, I am having trouble connecting to the university server right now.'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// ==========================================
// START SERVER
// ==========================================
server.listen(3001, () => {
  console.log('🚀 Server is running on port 3001');
});