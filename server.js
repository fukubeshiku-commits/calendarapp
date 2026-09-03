import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "schedule.json");

const app = express();
const port = process.env.PORT || 3000;

function ensureDataFile() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(dataFile)) {
        fs.writeFileSync(dataFile, "[]", "utf8");
    }
}

function readSchedule() {
    ensureDataFile();
    try {
        const raw = fs.readFileSync(dataFile, "utf8");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("Failed to read schedule:", error);
        return [];
    }
}

function writeSchedule(schedule) {
    ensureDataFile();
    fs.writeFileSync(dataFile, JSON.stringify(schedule, null, 2), "utf8");
}

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
    res.render("index.ejs");
});

app.get("/api/schedule", (req, res) => {
    res.json(readSchedule());
});

app.post("/api/schedule", (req, res) => {
    const schedule = Array.isArray(req.body) ? req.body : [];
    writeSchedule(schedule);
    res.json(schedule);
});

app.listen(port, '0.0.0.0', () => {
    console.log(`listening at http://0.0.0.0:${port}`);
});