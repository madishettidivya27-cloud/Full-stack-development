const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DB = path.join(__dirname, "data.json");

app.use(express.json());

const MET = {
  Running: 10,
  Cycling: 8,
  "Push-ups": 8,
  Gym: 6
};

const BADGES = [
  {
    id: "first",
    name: "First Sweat",
    icon: "🏁",
    test: member => member.workouts.length >= 1
  },
  {
    id: "five",
    name: "5K Trailblazer",
    icon: "🏃",
    test: member =>
      member.workouts.some(
        workout => workout.activity === "Running" && workout.distance >= 5
      )
  },
  {
    id: "cycle",
    name: "Road Warrior",
    icon: "🚴",
    test: member =>
      member.workouts.some(workout => workout.activity === "Cycling")
  },
  {
    id: "500",
    name: "500 Club",
    icon: "⚡",
    test: member => memberTotal(member) >= 500
  },
  {
    id: "1000",
    name: "1K Crusher",
    icon: "🔥",
    test: member => memberTotal(member) >= 1000
  },
  {
    id: "2500",
    name: "Point Machine",
    icon: "👑",
    test: member => memberTotal(member) >= 2500
  },
  {
    id: "streak",
    name: "Consistency Beast",
    icon: "📅",
    test: member =>
      new Set(member.workouts.map(workout => workout.date.slice(0, 10))).size >= 7
  },
  {
    id: "team",
    name: "Squad Goals",
    icon: "🤝",
    team: true
  }
];

function memberTotal(member) {
  return member.workouts.reduce((sum, workout) => sum + workout.points, 0);
}

function makeMember(name, id) {
  return { id, name, workouts: [] };
}

function seed() {
  const squads = [
    ["Iron Legion", ["You", "Maya", "Arjun", "Sam"], 2100],
    ["Pace Makers", ["Nina", "Ethan", "Riya", "Omar"], 1900],
    ["Fit Avengers", ["Ava", "Noah", "Isha", "Kai"], 2300],
    ["Beast Mode", ["Zoe", "Dev", "Ari", "Jules"], 2000],
    ["Trail Blazers", ["Tara", "Max", "Anya", "Ben"], 1800]
  ].map(([name, names, goal], index) => ({
    id: `squad-${index + 1}`,
    name,
    goal,
    inviteCode: `FIT${100 + index}`,
    members: names.map((memberName, memberIndex) =>
      makeMember(memberName, `m-${index}-${memberIndex}`)
    )
  }));

  const demoWorkouts = [
    ["m-0-0", "Running", 30, 5, 320],
    ["m-0-1", "Cycling", 40, 12, 320],
    ["m-0-2", "Gym", 45, 0, 270],
    ["m-0-3", "Push-ups", 30, 0, 240],
    ["m-1-0", "Running", 30, 4, 300],
    ["m-1-1", "Gym", 40, 0, 240],
    ["m-1-2", "Cycling", 30, 8, 240],
    ["m-1-3", "Push-ups", 25, 0, 200],
    ["m-2-0", "Cycling", 35, 10, 280],
    ["m-2-1", "Running", 25, 3, 250],
    ["m-2-2", "Gym", 35, 0, 210],
    ["m-2-3", "Push-ups", 30, 0, 240],
    ["m-3-0", "Running", 20, 3, 200],
    ["m-3-1", "Cycling", 30, 7, 240],
    ["m-3-2", "Gym", 30, 0, 180],
    ["m-3-3", "Push-ups", 20, 0, 160],
    ["m-4-0", "Cycling", 25, 6, 200],
    ["m-4-1", "Running", 20, 3, 200],
    ["m-4-2", "Gym", 25, 0, 150],
    ["m-4-3", "Push-ups", 20, 0, 160]
  ];

  for (const [memberId, activity, duration, distance, points] of demoWorkouts) {
    const member = squads
      .flatMap(squad => squad.members)
      .find(item => item.id === memberId);

    member.workouts.push({
      id: crypto.randomUUID(),
      activity,
      duration,
      distance,
      intensity: "Moderate",
      points,
      date: new Date().toISOString(),
      cheers: 0
    });
  }

  return { squads };
}

function saveDB(value = db) {
  fs.writeFileSync(DB, JSON.stringify(value, null, 2));
}

function loadDB() {
  try {
    const saved = JSON.parse(fs.readFileSync(DB, "utf8"));
    if (saved && Array.isArray(saved.squads)) {
      return saved;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("Database file was invalid; using demo data:", error.message);
    }
  }

  const initial = seed();
  saveDB(initial);
  return initial;
}

let db = loadDB();

function allWorkouts(squad) {
  return squad.members.flatMap(member =>
    member.workouts.map(workout => ({
      ...workout,
      memberId: member.id,
      memberName: member.name,
      squadId: squad.id
    }))
  );
}

function startFor(period) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === "all") return new Date(0);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "day") return now;

  now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return now;
}

function pointsInPeriod(workouts, period) {
  const start = startFor(period).getTime();

  return workouts
    .filter(workout => new Date(workout.date).getTime() >= start)
    .reduce((total, workout) => total + workout.points, 0);
}

function summary(squad, period) {
  const workouts = allWorkouts(squad);
  const weeklyTeamBadge =
    pointsInPeriod(workouts, "week") >= squad.goal
      ? BADGES.filter(badge => badge.team)
      : [];

  return {
    points: pointsInPeriod(workouts, period),
    goal: squad.goal,
    members: squad.members
      .map(member => ({
        id: member.id,
        name: member.name,
        points: pointsInPeriod(member.workouts, period),
        total: memberTotal(member),
        workoutCount: member.workouts.length,
        badges: [
          ...BADGES.filter(badge => !badge.team && badge.test(member)),
          ...weeklyTeamBadge
        ].map(({ id, name, icon }) => ({ id, name, icon }))
      }))
      .sort((a, b) => b.points - a.points),
    workouts
  };
}

app.get("/api/state", (req, res) => {
  const allowedPeriods = ["day", "week", "month", "all"];
  const period = allowedPeriods.includes(req.query.period)
    ? req.query.period
    : "week";

  const squads = db.squads
    .map(squad => ({
      id: squad.id,
      name: squad.name,
      goal: squad.goal,
      inviteCode: squad.inviteCode,
      ...summary(squad, period)
    }))
    .sort((a, b) => b.points - a.points);

  res.json({
    squads,
    period,
    met: MET,
    badges: BADGES.map(({ id, name, icon }) => ({ id, name, icon }))
  });
});

app.post("/api/workouts", (req, res) => {
  const {
    squadId,
    memberId,
    activity,
    duration,
    distance = 0,
    intensity = "Moderate"
  } = req.body || {};

  const squad = db.squads.find(item => item.id === squadId);
  const member = squad?.members.find(item => item.id === memberId);
  const minutes = Number(duration);
  const km = Number(distance);
  const multipliers = { Easy: 0.8, Moderate: 1, High: 1.25 };

  if (!squad || !member) {
    return res.status(404).json({ error: "Choose a valid squad and member." });
  }

  if (
    !MET[activity] ||
    !Number.isFinite(minutes) ||
    minutes < 1 ||
    minutes > 180 ||
    !Number.isFinite(km) ||
    km < 0 ||
    km > 300 ||
    !multipliers[intensity]
  ) {
    return res.status(400).json({
      error: "Check activity, duration (1–180), distance (0–300), and intensity."
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const minutesLoggedToday = member.workouts
    .filter(workout => workout.date.slice(0, 10) === today)
    .reduce((total, workout) => total + workout.duration, 0);

  if (minutesLoggedToday + minutes > 180) {
    return res.status(400).json({
      error: "Daily limit is 180 minutes per member."
    });
  }

  const points = Math.round(minutes * MET[activity] * multipliers[intensity]);

  member.workouts.push({
    id: crypto.randomUUID(),
    activity,
    duration: minutes,
    distance: km,
    intensity,
    points,
    date: new Date().toISOString(),
    cheers: 0
  });

  saveDB();
  res.status(201).json({ points });
});

app.post("/api/squads", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const names = Array.isArray(req.body?.members)
    ? req.body.members.map(memberName => String(memberName).trim()).filter(Boolean)
    : [];
  const goal = Number(req.body?.goal);

  if (name.length < 2 || name.length > 40) {
    return res.status(400).json({
      error: "Squad name must be 2–40 characters."
    });
  }

  if (names.length < 4 || names.length > 6) {
    return res.status(400).json({
      error: "A squad must have 4–6 members."
    });
  }

  if (!Number.isFinite(goal) || goal < 100 || goal > 100000) {
    return res.status(400).json({
      error: "Goal must be 100–100,000 points."
    });
  }

  const id = crypto.randomUUID();
  const squad = {
    id,
    name,
    goal,
    inviteCode: crypto.randomBytes(3).toString("hex").toUpperCase(),
    members: names.map((memberName, index) =>
      makeMember(memberName, `${id}-${index}`)
    )
  };

  db.squads.push(squad);
  saveDB();

  res.status(201).json({ id, inviteCode: squad.inviteCode });
});

app.post("/api/cheer", (req, res) => {
  const { squadId, workoutId } = req.body || {};
  const squad = db.squads.find(item => item.id === squadId);
  const workout = squad && allWorkouts(squad).find(item => item.id === workoutId);

  if (!workout) {
    return res.status(404).json({ error: "Workout not found." });
  }

  const owner = squad.members.find(member => member.id === workout.memberId);
  const savedWorkout = owner.workouts.find(item => item.id === workoutId);
  savedWorkout.cheers = (savedWorkout.cheers || 0) + 1;

  saveDB();
  res.json({ cheers: savedWorkout.cheers });
});

const html = fs.readFileSync(
  path.join(__dirname, "public", "index.html"),
  "utf8"
);

app.get("/", (_req, res) => {
  res.type("html").send(html);
});

app.listen(PORT, () => {
  console.log(`FitForge is running at http://localhost:${PORT}`);
});