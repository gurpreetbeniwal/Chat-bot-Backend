require('dotenv').config();
const mongoose = require('mongoose');

// Define the Schema
const courseInfoSchema = new mongoose.Schema({
  courseName: String,
  totalFee: String,
  semesters: String,
  feePerSemester: String
});
const CourseInfo = mongoose.model('CourseInfo', courseInfoSchema);

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('⏳ Connected to MongoDB. Preparing to seed data...');

    // Optional: Clear out old data so you don't get duplicates if you run this twice
    await CourseInfo.deleteMany({});
    console.log('🧹 Cleared old course data.');

    const courses = [
      // ==========================================
      // UNDERGRADUATE (UG) COURSES
      // ==========================================
      { courseName: "B.Tech", totalFee: "4,50,000", semesters: "8", feePerSemester: "56,250" },
      { courseName: "BCA", totalFee: "2,40,000", semesters: "6", feePerSemester: "40,000" },
      { courseName: "BBA", totalFee: "2,70,000", semesters: "6", feePerSemester: "45,000" },
      { courseName: "B.A", totalFee: "1,20,000", semesters: "6", feePerSemester: "20,000" },
      { courseName: "B.Com", totalFee: "1,50,000", semesters: "6", feePerSemester: "25,000" },
      { courseName: "B.Sc", totalFee: "1,80,000", semesters: "6", feePerSemester: "30,000" },
      { courseName: "B.Sc IT", totalFee: "2,10,000", semesters: "6", feePerSemester: "35,000" },
      { courseName: "B.Sc CS", totalFee: "2,10,000", semesters: "6", feePerSemester: "35,000" },
      { courseName: "B.Sc Nursing", totalFee: "3,20,000", semesters: "8", feePerSemester: "40,000" },
      { courseName: "B.Arch", totalFee: "6,00,000", semesters: "10", feePerSemester: "60,000" },
      { courseName: "B.Des", totalFee: "4,00,000", semesters: "8", feePerSemester: "50,000" },
      { courseName: "BFA", totalFee: "2,40,000", semesters: "8", feePerSemester: "30,000" },
      { courseName: "BHM", totalFee: "3,60,000", semesters: "8", feePerSemester: "45,000" },
      { courseName: "B.Pharm", totalFee: "4,00,000", semesters: "8", feePerSemester: "50,000" },
      { courseName: "BPT", totalFee: "3,60,000", semesters: "9", feePerSemester: "40,000" }, // 4.5 Years
      { courseName: "LLB", totalFee: "3,00,000", semesters: "6", feePerSemester: "50,000" },
      { courseName: "BTTM", totalFee: "2,80,000", semesters: "8", feePerSemester: "35,000" },
      { courseName: "B.Com Hons", totalFee: "2,10,000", semesters: "6", feePerSemester: "35,000" },
      { courseName: "B.A Hons", totalFee: "1,80,000", semesters: "6", feePerSemester: "30,000" },
      { courseName: "B.Sc Hons", totalFee: "2,40,000", semesters: "6", feePerSemester: "40,000" },

      // ==========================================
      // POSTGRADUATE (PG) COURSES
      // ==========================================
      { courseName: "MCA", totalFee: "2,40,000", semesters: "4", feePerSemester: "60,000" },
      { courseName: "MBA", totalFee: "4,00,000", semesters: "4", feePerSemester: "1,00,000" },
      { courseName: "M.Tech", totalFee: "3,00,000", semesters: "4", feePerSemester: "75,000" },
      { courseName: "M.A", totalFee: "1,00,000", semesters: "4", feePerSemester: "25,000" }
    ];

    // Insert all courses into the database
    await CourseInfo.insertMany(courses);
    console.log(`✅ Success! Inserted ${courses.length} courses into the database.`);
    
    process.exit();
  })
  .catch(err => {
    console.error('❌ Error seeding data:', err);
    process.exit(1);
  });