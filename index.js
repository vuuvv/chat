var express = require('express');
var http = require('http');
var socketio = require('socket.io');
var util = require('util');

var app = express();
var server = http.Server(app);
var io = socketio(server);

var hasOwnProperty = Object.prototype.hasOwnProperty;

var rooms = {};

var inspect = function(o) {
    return JSON.stringify(o, null, 2);
}

var find = function(arr, callback) {
    var ret;
    for (var i = 0, len = arr.length; i < len; i++) {
        if (callback(arr[i]))
            return arr[i];
    }
}

var findIndex = function(arr, callback) {
    for (var i = 0, len = arr.length; i < len; i++) {
        if (callback(arr[i]))
            return i;
    }
    return -1;
}

var isEmpty = function(obj) {
    if (obj == null) return true;

    if (obj.length === 0) return true;
    if (obj.length > 0) return false;

    for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) return false;
    }
}

var createRoom = function(id) {
    log("create room: creator [%s], room [%s]", id, id);
    rooms[id] = {
        id: id,
        manager: id,
        members:[{
            id: id
        }]
    }
    return id;
}

var joinRoom = function(id, roomId) {
    var room = rooms[roomId];
    if (room) {
        log("join room: newbie %s, room %s", id, roomId);
        var m = find(room.members, function(m) {
            return m.id === id;
        });
        if (!m) {
            m = { id: id };
            room.members.push(m);
        }
        var socket = io.sockets.connected[m.id];
        if (socket) {
            socket.emit("joined", room);
        }
        sendMessage(roomId, id, {
            type: "text",
            value: "joined"
        });
        return roomId;
    }
}

var quitRoom = function(id, roomId) {
    log("index: %s", roomId);
    var room = rooms[roomId];
    if (room) {
        var mates = room.members;
        var index = findIndex(mates, function(m) { return m.id === id;});
        log("find room index: %d", index);
        if (index > -1) {
            mates.splice(index, 1);
            if (mates.length === 0) {
                log("dismiss: %s", roomId);
                delete rooms[roomId];
                // quit
            } else {
                log("quit: user %s, room %s", id, roomId);
                sendMessage(roomId, id, {
                    type: "text",
                    value: "leave"
                });
                if (id === room.manager) {
                    log(util.format("%s change manager to %s", roomId, id));
                    room.manager = mates[0].id;
                    sendMessage(roomId, id, {
                        type: "text",
                        value: id + " is new manager"
                    });
                }
            }
        }
    }
}

var sendMessageTo = function(target, from, msg) {
    log("send message to %s, msg %s", target, inspect(msg));
    var socket = io.sockets.connected[target];
    socket && socket.emit("message", {
        type: msg.type,
        from: from,
        value: msg.value
    });
}

var sendMessage = function(roomId, from, msg) {
    log("send message to room %s, msg %s", roomId, inspect(msg));
    var room = rooms[roomId];
    if (room) {
        room.members.forEach(function(member) {
            sendMessageTo(member.id, from, msg);
        });
    }
}

var forward = function(socket, event, msg) {
    log("forward event: %s, from: %s, to: %s", event, socket.id, msg.to);
    var targetSocket = io.sockets.connected[msg.to];
    msg.from = socket.id;
    targetSocket && targetSocket.emit(event, msg);
}

var log = function(text) {
    if (arguments.length > 1)
        text = util.format.apply(null, arguments);
    console.log(util.format("-- %s --", text));
};


app.use(express.static("public"));

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/chat', function(req, res) {
    res.sendFile(__dirname + '/chat.html');
});

app.get('/rooms', function(req, res) {
    var data = JSON.parse(inspect(rooms));
    res.status(200).json(data);
});

io.on('connection', function(socket) {
    log("connected: ", socket.id);
    socket.emit("id", socket.id);
    var roomId = socket.id;

    socket.on('create room', function() {
        roomId = createRoom(socket.id);
        socket.emit("created", roomId);
    });

    socket.on('join room', function(rid) {
        roomId = joinRoom(socket.id, rid);
        log("room info: %s %s", rid, inspect(rooms));
    });

    socket.on('rooms', function() {
        log('get all rooms');
        socket.emit('rooms', rooms);
    });

    socket.on('disconnect', function() {
        log("disconnect: %s", socket.id);
        quitRoom(socket.id, roomId);
        log("room info: %s", inspect(rooms));
    });

    socket.on('signal', function(msg) {
        log("signal: %s", inspect(msg));
        forward(socket, 'signal', msg);
    });

    socket.on('message', function(msg) {
        log("message: %s", inspect(msg));
        if (msg.type == "text") {
            if (msg.to) {
                sendMessageTo(msg.to, socket.id, msg);
            } else {
                sendMessage(msg.room, socket.id, msg);
            }
        }
    });
});

server.listen(3000, function() {
    console.log('listening on: *:3000');
});
