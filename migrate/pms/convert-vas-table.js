/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname);
const RAW_PATH = path.join(ROOT, "seed-raw.txt");
const OUTPUT_PATH = path.join(ROOT, "pms-import.json");

const slug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";

const parseLines = (raw) =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const raw = fs.readFileSync(RAW_PATH, "utf-8");
const lines = parseLines(raw);
if (lines.length <= 1) {
  console.error("seed-raw.txt is empty or missing rows.");
  process.exit(1);
}

const products = new Map();
const machines = new Map();
const people = new Map();
const routing = new Map();
const skills = new Map();

const addProduct = (name, category) => {
  const id = `${slug(name)}__${slug(category)}`;
  if (!products.has(id)) {
    products.set(id, { id, name: name.trim(), category: category.trim() });
  }
  return id;
};

const addMachine = (name, process) => {
  const id = `${slug(name)}__${slug(process)}`;
  if (!machines.has(id)) {
    machines.set(id, {
      id,
      name: name.trim(),
      process: process.trim(),
      shiftMinutes: 480,
      active: true,
    });
  }
  return id;
};

const addPerson = (name) => {
  const id = slug(name);
  if (!people.has(id)) {
    people.set(id, { id, name: name.trim(), role: "Supervisor" });
  }
  return id;
};

lines.slice(1).forEach((line) => {
  let parts = line.split("\t");
  if (parts.length < 11) {
    parts = line.split(/\s{2,}/);
  }
  if (parts.length < 11) return;

  const [
    supervisor,
    productName,
    machineName,
    process,
    category,
    itemCode,
    processGroup,
    stepNo,
    cycle,
    capHr,
    ops,
  ] = parts;

  const productId = addProduct(productName, category);
  const machineId = addMachine(machineName, process);

  String(supervisor || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      const personId = addPerson(name);
      const skillId = `${machineId}_${personId}_${slug(category)}`;
      if (!skills.has(skillId)) {
        skills.set(skillId, {
          id: skillId,
          machineId,
          personId,
          process: process.trim(),
          category: category.trim(),
          allowed: true,
        });
      }
    });

  const stepVal = Number(stepNo);
  const cycleVal = Number(cycle);
  const opsVal = Number(ops) || 1;
  const routingId = `${productId}_${stepVal}`;
  if (!routing.has(routingId)) {
    routing.set(routingId, {
      id: routingId,
      productId,
      stepNo: stepVal,
      process: process.trim(),
      cycleMinutes: Number.isFinite(cycleVal) ? cycleVal : 0,
      ops: Number.isFinite(opsVal) ? opsVal : 1,
    });
  }
});

const payload = {
  products: Array.from(products.values()),
  machines: Array.from(machines.values()),
  people: Array.from(people.values()),
  routing: Array.from(routing.values()),
  skills: Array.from(skills.values()),
  downtimes: [],
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

console.log(`JSON written to ${OUTPUT_PATH}`);
console.log(`Products: ${payload.products.length}`);
console.log(`Machines: ${payload.machines.length}`);
console.log(`People: ${payload.people.length}`);
console.log(`Routing: ${payload.routing.length}`);
console.log(`Skills: ${payload.skills.length}`);
