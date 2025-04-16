require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();

app.use(express.json());
app.use(cors());

const mongoURI = process.env.MONGO_URI;
mongoose
  .connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

const bugSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: { type: String },
});
const Bug = mongoose.model("Bug", bugSchema);

const runPythonScript = (scriptPath, args = []) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python3", [scriptPath, ...args]);

    let result = "";
    pythonProcess.stdout.on("data", (data) => {
      result += data.toString();
    });

    pythonProcess.stderr.on("data", (error) => {
      console.error("Python Script Error:", error.toString());
      reject(error.toString());
    });

    pythonProcess.on("close", () => {
      resolve(result.trim());
    });
  });
};

app.post("/api/bugs/single", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) {
      return res
        .status(400)
        .json({ error: "Title and description are required." });
    }

    const severity = await runPythonScript("./single_bug_model.py", [
      title,
      description,
    ]);

    const newBug = new Bug({ title, description, severity });
    await newBug.save();
    res
      .status(201)
      .json({ message: "Bug report saved successfully!", bug: newBug });
  } catch (error) {
    console.error("Error saving bug:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/bugs/upload", async (req, res) => {
  try {
    const bugs = req.body;

    if (!Array.isArray(bugs) || bugs.length === 0) {
      return res
        .status(400)
        .json({ error: "Invalid bug data. Expected an array of bugs." });
    }

    const bugsForPrediction = bugs.map((bug) => [bug.title, bug.description]);

    const severities = await runPythonScript("./multiple_bug_model.py", [
      JSON.stringify(bugsForPrediction),
    ]);

    const severitiesArray = JSON.parse(severities);

    const bugsWithSeverities = bugs.map((bug, index) => ({
      ...bug,
      severity: severitiesArray[index] || "Unknown",
    }));

    await Bug.insertMany(bugsWithSeverities);
    res.status(201).json({
      message: `${bugsWithSeverities.length} bug reports saved successfully!`,
    });
  } catch (error) {
    console.error("Error saving bug reports:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
