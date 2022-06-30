const { Server } = require("socket.io");
const fs = require("fs/promises");

const db = require("./database");

const io = new Server({
  cors: { origin: "*", methods: ["GET", "POST"] },
});

/* TO AND FROM DATABASE */

// CHATS

async function findChat(room) {
  const sql = `SELECT * FROM chats WHERE name = ?`;

  return new Promise((resolve, reject) => {
    db.get(sql, [room], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function getChatRooms() {
  const sql = `SELECT name FROM chats`;

  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function addChat(name) {
  const sql = `INSERT INTO chats (name) VALUES (?)`;

  return new Promise((resolve, reject) => {
    db.all(sql, [name], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

async function removeChat(name) {
  const sql = `DELETE FROM chats WHERE name = ?`;
  db.run(sql, [name]);
}

// USERS

async function findUser(username) {
  const sql = `SELECT * FROM users WHERE username = ?`;

  return new Promise((resolve, reject) => {
    db.get(sql, [username], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function addUser(username) {
  const sql = `INSERT INTO users (username) VALUES (?)`;
  db.run(sql, [username]);
}

function removeUser(username) {
  const sql = `DELETE FROM users WHERE username = ?`;
  db.run(sql, [username]);
}

// MESSAGES

async function getMessages(room) {
  const sql = `SELECT * FROM messages WHERE room_name is (?) AND receiver = "all" `;

  return new Promise((resolve, reject) => {
    db.all(sql, [room], (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows);
    });
  });
}

function addMessage(message) {
  const sql = `INSERT INTO messages (receiver, message, sender_id, room_name, room_id, date, time) VALUES (?,?,?,?,?,?,?)`;
  db.run(sql, [
    `${message.to}`,
    `${message.message}`,
    `${message.sender_id}`,
    `${message.room_name}`,
    `${message.room_id}`,
    `${message.date}`,
    `${message.time}`,
  ]);
}

async function deleteMessages(roomName) {
  const room = await findChat(roomName);
  const roomId = room.id;

  const sql = `DELETE FROM messages where room_id = ?`;
  db.run(sql, [roomId]);
}

// GET SOCKETS

async function getAllActiveUsers() {
  const sockets = await io.fetchSockets();
  const users = [];

  for (const s of sockets) {
    if (s.username) {
      users.push(s.username);
    }
  }
  return users;
}

async function getRoomActiveUsers(room) {
  const sockets = await io.in(room).fetchSockets();
  const users = [];

  for (const s of sockets) {
    if (s.username) {
      users.push(s.username);
    }
  }
  return users;
}

async function getOneUser(room, username) {
  const sockets = await io.in(room).fetchSockets();
  const user = sockets.find((i) => i.username === username);

  return user.id;
}

/* SERVER */

io.on("connection", (socket) => {
  console.log(`Connected to server with id ${socket.id}`);

  socket.use(async ([event, data], next) => {
    if (event === "message") {
      const message = JSON.parse(data);

      const entry = {
        id: socket.id,
        event: event,
        time: socket.handshake.time,
        room: message.room,
        message: message.text,
      };

      try {
        await fs.writeFile("Log.txt", JSON.stringify(entry), { flag: "a" });
      } catch (err) {
        console.log(err);
      }
    }
    next();
  });

  socket.on("set_default_room", async () => {
    socket.currentRoom = "default";
    socket.join("default");

    const users = await getAllActiveUsers();
    io.to("default").emit("set_users", users);
  });

  socket.on("get_chats", async () => {
    const res = await getChatRooms();
    socket.emit("set_chats", res);
  });

  socket.on("create_room", async (data) => {
    const room = JSON.parse(data);

    if (room.name === "") {
      return;
    } else {
      const roomName = room.name;
      const res = await findChat(roomName);

      if (res === undefined) {
        addChat(roomName);

        const result = await getChatRooms();
        socket.emit("set_chats", result);
      } else {
        socket.emit("room_error");
      }
    }
  });

  socket.on("delete_chat", async (data) => {
    const chat = JSON.parse(data);
    const chatName = chat.name;

    await deleteMessages(chatName);
    await removeChat(chatName);

    const res = await getChatRooms();
    socket.emit("set_chats", res);
  });

  socket.on("set_username", async (name) => {
    const res = await findUser(name);

    if (res === undefined) {
      socket.username = name;
      socket.emit("new_user", socket.username);

      addUser(socket.username);

      const users = await getAllActiveUsers();
      io.to("default").emit("set_users", users);
    } else {
      socket.emit("user_error");
    }
  });

  socket.on("get_messages", async (room) => {
    const oldMessages = await getMessages(room);

    socket.emit("set_messages", oldMessages);
  });

  socket.on("message", async (data) => {
    const message = JSON.parse(data);

    if (message.text === "") {
      socket.emit("message_error");
      return;
    }

    const whisper = message.to;
    const room = message.room;
    const roomNr = await findChat(room);

    if (whisper !== "all") {
      const userId = await getOneUser(room, whisper);

      const newMessage = {
        to: whisper,
        message: message.text,
        sender_id: socket.username,
        room_name: room,
        room_id: roomNr.id,
        date: message.date,
        time: message.time,
      };

      addMessage(newMessage);

      socket.to(userId).emit("PM", {
        to: whisper,
        username: socket.username,
        text: message.text,
        date: message.date,
        time: message.time,
      });

      socket.emit("PM", {
        to: whisper,
        username: socket.username,
        text: message.text,
        date: message.date,
        time: message.time,
      });
    } else {
      const newMessage = {
        to: "all",
        message: message.text,
        sender_id: socket.username,
        room_name: room,
        room_id: roomNr.id,
        date: message.date,
        time: message.time,
      };

      addMessage(newMessage);

      io.to(room).emit("message", {
        username: socket.username,
        text: message.text,
        date: message.date,
        time: message.time,
      });
    }
  });

  socket.on("currently_writing", (room) => {
    socket.to(room).emit("writing", socket.username);
  });

  socket.on("done_writing", (room) => {
    socket.to(room).emit("not_writing");
  });

  socket.on("join_room", async (room) => {
    if (!socket.username) {
      socket.emit("no_username");
      return;
    } else {
      if (socket.currentRoom === "default") {
        socket.leave(socket.currentRoom);

        socket.currentRoom = room;
        socket.join(room);

        const users = await getRoomActiveUsers(socket.currentRoom);
        io.to(room).emit("set_users", users);
        io.to(room).emit("joined_room", socket.username, room);
      } else {
        socket.leave(socket.currentRoom);

        socket.currentRoom = room;
        socket.join(room);

        const users = await getRoomActiveUsers(room);
        io.to(room).emit("set_users", users);
        io.to(room).emit("joined_room", socket.username, room);
      }
    }
  });

  socket.on("get_users", async () => {
    const users = await getAllActiveUsers();
    io.to("default").emit("set_users", users);
  });

  socket.on("leave_room", async (room) => {
    socket.leave(room);

    socket.currentRoom = "default";
    socket.join("default");

    const allUsers = await getAllActiveUsers();
    const roomUsers = await getRoomActiveUsers(room);

    io.to(room).emit("set_users", roomUsers);
    io.to("default").emit("left_room", socket.username);
    io.to("default").emit("set_users", allUsers);
  });

  socket.on("disconnect", async (reason) => {
    console.log(`${socket.id} disconnected`);

    if (socket.username) {
      removeUser(socket.username);
    }

    if (socket.currentRoom === "default") {
      const users = await getAllActiveUsers();
      io.to("default").emit("set_users", users);
    } else {
      const users = await getAllActiveUsers();
      io.to(socket.currentRoom).emit("set_users", users);
    }
  });
});

io.listen(4000);
