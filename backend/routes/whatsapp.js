const path = require('path');
// Load configuration from .env relative to this script
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const router = express.Router();
const dialogflow = require('@google-cloud/dialogflow').v2beta1;
const mongoose = require('mongoose');
const fs = require('fs');
const twilio = require('twilio');

// We need to parse urlencoded data for Twilio webhooks
router.use(express.urlencoded({ extended: true }));

// ==========================================
// 1. MONGODB SCHEMAS & MODELS
// ==========================================
// We define/retrieve models safely to prevent OverwriteModelError if imported in server.js
const Chat = mongoose.models.Chat || mongoose.model('Chat', new mongoose.Schema({
  userId: String,
  sender: String, // 'user' or 'bot'
  text: String,
  buttons: [String],
  courseCategories: Array,
  feeCard: Object,
  durationCard: Object,
  syllabusCard: Object,
  timestamp: { type: Date, default: Date.now }
}));

const Admission = mongoose.models.Admission || mongoose.model('Admission', new mongoose.Schema({
  userId: String,
  name: String,
  email: String,
  phone: String,
  course: String,
  status: { type: String, default: 'Pending' },
  timestamp: { type: Date, default: Date.now }
}));

const CourseInfo = mongoose.models.CourseInfo || mongoose.model('CourseInfo', new mongoose.Schema({
  courseName: String,
  totalFee: String,
  semesters: String,
  feePerSemester: String
}));

// ==========================================
// 2. DIALOGFLOW SETUP
// ==========================================
console.log("🤖 [WhatsApp Webhook] Initializing Dialogflow...");

// Resolve key path relative to this file if it's relative
const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const keyPath = path.isAbsolute(keyFilename || '')
  ? keyFilename
  : path.resolve(__dirname, '..', keyFilename || '');

if (!keyFilename) {
  console.log("❌ [WhatsApp Webhook] GOOGLE_APPLICATION_CREDENTIALS is undefined");
} else {
  console.log(`📂 [WhatsApp Webhook] Checking Dialogflow Key File at: ${keyPath}`);
  if (fs.existsSync(keyPath)) {
    console.log("✅ [WhatsApp Webhook] Dialogflow Key File Found");
  } else {
    console.log("❌ [WhatsApp Webhook] Dialogflow Key File NOT FOUND");
  }
}

let sessionClient;
try {
  sessionClient = new dialogflow.SessionsClient({
    keyFilename: keyPath
  });
  console.log("✅ [WhatsApp Webhook] Dialogflow Client Initialized");
} catch (error) {
  console.log("❌ [WhatsApp Webhook] Dialogflow Client Initialization Failed");
  console.error(error);
}

const projectId = process.env.DIALOGFLOW_PROJECT_ID;

// ==========================================
// 3. WHATSAPP FORMATTING UTILITY
// ==========================================
/**
 * Formats custom payloads (cards, buttons, categories) from Dialogflow response
 * into clean, readable text suitable for WhatsApp.
 */
function formatWhatsAppMessage(text, options = {}) {
  let formattedText = text || '';

  // 1. Handle course categories
  if (options.courseCategories && options.courseCategories.length > 0) {
    formattedText += '\n\n*📚 Available Course Categories:*\n';
    options.courseCategories.forEach(cat => {
      formattedText += `\n*${cat.heading}*:\n`;
      cat.courses.forEach(course => {
        formattedText += `• ${course}\n`;
      });
    });
  }

  // 2. Handle fee card
  if (options.feeCard) {
    const fee = options.feeCard;
    formattedText += `\n\n*💰 Fee Structure for ${fee.course}:*\n`;
    formattedText += `• Total Fee: ${fee.totalFee}\n`;
    formattedText += `• Semesters: ${fee.semesters}\n`;
    formattedText += `• Fee Per Semester: ${fee.feePerSemester}\n`;
  }

  // 3. Handle duration card
  if (options.durationCard) {
    const duration = options.durationCard;
    formattedText += `\n\n*⏱ Duration for ${duration.course}:*\n`;
    formattedText += `• Semesters: ${duration.semesters}\n`;
    formattedText += `• Years: ${duration.years}\n`;
  }

  // 4. Handle syllabus card
  if (options.syllabusCard) {
    const syllabus = options.syllabusCard;
    formattedText += `\n\n*📖 Syllabus Link for ${syllabus.course}:*\n`;
    formattedText += `${syllabus.url}\n`;
  }

  // 5. Handle buttons as a structured response selection
  if (options.buttons && options.buttons.length > 0) {
    formattedText += '\n\n*👉 Reply with one of these options:*\n';
    options.buttons.forEach(btn => {
      formattedText += `- *${btn}*\n`;
    });
  }

  return formattedText.trim();
}

// ==========================================
// 4. WEBHOOK ROUTE HANDLER
// ==========================================
router.post('/webhook', async (req, res) => {
  const fromRaw = req.body.From || '';
  const bodyText = req.body.Body || '';

  // Clean WhatsApp prefix from From field (e.g. "whatsapp:+14155238886" -> "+14155238886")
  const userId = fromRaw.replace(/^whatsapp:/i, '').trim();

  console.log(`[WhatsApp Webhook] Incoming message from ${userId}: "${bodyText}"`);

  // Initialize Twilio messaging response (TwiML)
  const twiml = new twilio.twiml.MessagingResponse();

  if (!bodyText) {
    twiml.message("I didn't receive any message content. How can I help you today?");
    res.setHeader('Content-Type', 'text/xml');
    return res.send(twiml.toString());
  }

  try {
    // A. Save the user's message to MongoDB
    console.log("💾 [WhatsApp Webhook] Saving User Message to MongoDB...");
    const userMessage = new Chat({
      userId,
      sender: 'user',
      text: bodyText
    });
    await userMessage.save();

    // B. Send message to Dialogflow
    console.log("🤖 [WhatsApp Webhook] Sending to Dialogflow...");
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, userId);
    
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: bodyText,
          languageCode: 'en-US'
        },
      },
      queryParams: {
        knowledgeBaseNames: [
          "projects/edtech-chatbot-493507/knowledgeBases/MTc5ODI4NDkyNjAyNzM1MzI5Mjk"
        ]
      }
    };

    const responses = await sessionClient.detectIntent(request);
    const queryResult = responses[0].queryResult;

    console.log(`🎯 [WhatsApp Webhook] Intent Match: ${queryResult.intent ? queryResult.intent.displayName : 'None'}`);

    let aiReply = queryResult.fulfillmentText;
    let buttonArray = [];
    let courseCategories = null;
    let feeCard = null;
    let durationCard = null;
    let syllabusCard = null;

    // C. Process Custom Payloads (Buttons, Course Categories)
    const messages = queryResult.fulfillmentMessages;
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        // Buttons
        if (msg.payload && msg.payload.fields && msg.payload.fields.isButtons) {
          const btnList = msg.payload.fields.buttons.listValue.values;
          buttonArray = btnList.map(b => b.stringValue);
        }

        // Course Categories
        if (msg.payload && msg.payload.fields && msg.payload.fields.isCourseCategories) {
          courseCategories = [];
          const categoriesData = msg.payload.fields.categories.listValue.values;
          categoriesData.forEach(cat => {
            const catFields = cat.structValue.fields;
            const heading = catFields.heading.stringValue;
            const courses = catFields.courses.listValue.values.map(c => c.stringValue);
            courseCategories.push({ heading, courses });
          });
        }
      });
    }

    // D. Knowledge Base Matches
    if (queryResult.knowledgeAnswers && queryResult.knowledgeAnswers.answers && queryResult.knowledgeAnswers.answers.length > 0) {
      aiReply = queryResult.knowledgeAnswers.answers[0].answer;
    }

    // E. Handle Admission Form Completion
    if (queryResult.intent && queryResult.intent.displayName === 'Admission_Form') {
      if (queryResult.allRequiredParamsPresent === true) {
        const params = queryResult.parameters.fields;
        const newStudentName = params.student_name.stringValue;
        const newStudentEmail = params.student_email.stringValue;
        const newStudentPhone = params.student_phone.stringValue;
        const newCourse = params.desired_course.stringValue;

        console.log(`🎓 [WhatsApp Webhook] Saving admission for: ${newStudentName}`);
        const newApplication = new Admission({
          userId: userId,
          name: newStudentName,
          email: newStudentEmail,
          phone: newStudentPhone,
          course: newCourse
        });
        await newApplication.save();
      }
    }

    // F. Handle Course Fee Queries
    if (queryResult.intent && queryResult.intent.displayName === 'Course_Details_Fee') {
      console.log("📌 Parameters Fields:", JSON.stringify(queryResult.parameters.fields, null, 2));
      const requestedCourse = queryResult.parameters.fields.requested_course && queryResult.parameters.fields.requested_course.stringValue
        ? queryResult.parameters.fields.requested_course.stringValue
        : '';
      console.log(`💰 [WhatsApp Webhook] Looking up fees for: "${requestedCourse}"`);
      const courseData = await CourseInfo.findOne({ courseName: requestedCourse });
      
      if (courseData) {
        aiReply = `Here is the detailed fee structure for the ${requestedCourse} program:`;
        feeCard = {
          course: courseData.courseName,
          totalFee: courseData.totalFee,
          semesters: courseData.semesters,
          feePerSemester: courseData.feePerSemester
        };
      } else {
        aiReply = `I am sorry, I am currently updating the fee database for ${requestedCourse}. Please contact the admissions office for immediate assistance.`;
      }
    }
    // G. Handle Course Duration Queries
    else if (queryResult.intent && queryResult.intent.displayName === 'Course_Details_Duration') {
      const requestedCourse = queryResult.parameters.fields.requested_course && queryResult.parameters.fields.requested_course.stringValue
        ? queryResult.parameters.fields.requested_course.stringValue
        : '';
      console.log(`⏱ [WhatsApp Webhook] Looking up duration for: "${requestedCourse}"`);
      const courseData = await CourseInfo.findOne({ courseName: requestedCourse });
      
      if (courseData) {
        const years = (parseInt(courseData.semesters) / 2) + " Years";
        aiReply = `Here is the duration information for the ${requestedCourse} program:`;
        durationCard = {
          course: courseData.courseName,
          semesters: courseData.semesters,
          years: years
        };
      } else {
        aiReply = `I am sorry, I couldn't find the duration data for ${requestedCourse}.`;
      }
    }
    // H. Handle Course Syllabus Queries
    else if (queryResult.intent && queryResult.intent.displayName === 'Course_Details_Syllabus') {
      const requestedCourse = queryResult.parameters.fields.requested_course && queryResult.parameters.fields.requested_course.stringValue
        ? queryResult.parameters.fields.requested_course.stringValue
        : '';
      console.log(`📖 [WhatsApp Webhook] Generating syllabus link for: "${requestedCourse}"`);
      const urlSlug = requestedCourse.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
      const dynamicUrl = `https://university.in/courses/${urlSlug}`;
      
      aiReply = `You can view and download the full syllabus for ${requestedCourse} from our official portal.`;
      syllabusCard = {
        course: requestedCourse,
        url: dynamicUrl
      };
    }

    // Fallback if empty response is generated
    if (!aiReply && buttonArray.length === 0 && (!courseCategories || courseCategories.length === 0) && !feeCard && !durationCard && !syllabusCard) {
      aiReply = "I am sorry, I couldn't process that. Could you try asking in a different way?";
    }

    // I. Format output message for WhatsApp
    const formattedReply = formatWhatsAppMessage(aiReply, {
      buttons: buttonArray,
      courseCategories,
      feeCard,
      durationCard,
      syllabusCard
    });

    // J. Save bot response to MongoDB
    console.log("💾 [WhatsApp Webhook] Saving Bot Response to MongoDB...");
    const botMessage = new Chat({
      userId,
      sender: 'bot',
      text: formattedReply,
      buttons: buttonArray.length > 0 ? buttonArray : undefined,
      courseCategories: courseCategories && courseCategories.length > 0 ? courseCategories : undefined,
      feeCard: feeCard || undefined,
      durationCard: durationCard || undefined,
      syllabusCard: syllabusCard || undefined
    });
    await botMessage.save();

    // K. Respond back to Twilio with TwiML
    twiml.message(formattedReply);
    res.setHeader('Content-Type', 'text/xml');
    return res.send(twiml.toString());

  } catch (error) {
    console.error("❌ [WhatsApp Webhook] Error processing request:", error);
    twiml.message("Sorry, I am having trouble connecting to the university server right now.");
    res.setHeader('Content-Type', 'text/xml');
    return res.send(twiml.toString());
  }
});

// Export the router
module.exports = router;

// ==========================================
// 5. STANDALONE SERVER BOOTSTRAP
// ==========================================
if (require.main === module) {
  // Load configuration from .env relative to this script
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

  // Connect to MongoDB
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ [WhatsApp Webhook] Connected to MongoDB'))
    .catch((err) => console.error('❌ [WhatsApp Webhook] MongoDB Connection Error:', err));

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Mount the router at the root level for the standalone server
  app.use('/', router);

  const PORT = process.env.WHATSAPP_PORT || 3002;
  app.listen(PORT, () => {
    console.log(`🚀 [WhatsApp Webhook] Service running on port ${PORT}`);
    console.log(`🔗 Webhook endpoint is at http://localhost:${PORT}/webhook`);
  });
}
