const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./db.sqlite", (error) => {
  if (error) {
    console.error(error.message);
    throw error;
  }

  console.log("Connected to database");

  const chatStatement = `CREATE TABLE chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT ,
    name TEXT NOT NULL UNIQUE 
  )`;

  const userStatement = `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE
  )`;

  const messageStatement = `CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receiver TEXT,
    message TEXT,
    sender_id TEXT,
    room_name TEXT, 
    room_id INTEGER,
    date TEXT,
    time TEXT
  )`;

  db.run(chatStatement, (error) => {
    if (error) {
      console.error(error.message);
      return;
    }

    const insertChatRooms = `INSERT INTO chats (name) VALUES (?)`;
    db.run(insertChatRooms, ["Music"]);
    db.run(insertChatRooms, ["Movies"]);
  });

  db.run(userStatement, (error) => {
    if (error) {
      console.error(error.message);
      return;
    }
    const insertUser = `INSERT INTO users (username) VALUES (?)`;
    db.run(insertUser, ["Admin"]);
  });

  db.run(messageStatement, (error) => {
    if (error) {
      console.error(error.message);
      return;
    }
  });
});

module.exports = db;
