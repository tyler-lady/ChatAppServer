const WebSocket = require('ws');
var models = require('./server.js').models;

const ws = new WebSocket.Server({port: 8080});
const clients = []; //array to be used for listing all currently connected clients

ws.on('connection', (ws) => {

    function login(email, password){
        models.User.login({email:email, password:password}, (err, result) => {
            if(err){
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    error: err
                }));
            } else {
                models.User.findOne({where: {id: result.userId}, include: 'Profile'}, (err2, user) => {
                    if(err2){
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            error: err2
                        }));  
                    } else {
                        const userObject = { //object to rep a generic user
                            id: user.id,
                            email: user.email,
                            ws: ws //the specific websocket instance for this user
                        };

                        clients.push(userObject); //upon successful login, object is created and added to clients array
                        console.log("Current Clients", clients);

                        ws.send(JSON.stringify({
                            type: 'LOGGEDIN',
                            data: {
                                session: result,
                                user: user
                            }
                        }))
                    }
                })
            }
        })
    }

    ws.on('message', (message) => {
        console.log('Got Message', JSON.parse(message));
        let parsed = JSON.parse(message);
        if(parsed){
            switch(parsed.type){
                case 'SIGNUP':
                    models.User.create(parsed.data, (err, user) => {
                        if(err){
                            ws.send(JSON.stringify({
                                type: 'ERROR',
                                error: err
                            }));
                        } else {
                            models.Profile.create({
                                userId: user.id,
                                name: parsed.data.name,
                                email: parsed.data.email
                            }, (profileError, profile) => {
                                if(profileError){
                                    ws.send(JSON.stringify({
                                        type: 'ERROR',
                                        error: err
                                    }));
                                } else {
                                    login(parsed.data.email, parsed.data.password);
                                }
                            })
                        }
                    });
                    break;
                case 'LOGIN':
                    login(parsed.data.email, parsed.data.password);
                    break;
                case 'SEARCH':
                    console.log('Searching for', parsed.data);
                    models.User.find({where: {email: {like: parsed.data}}}, (err, users) => { //currently only searches using the email, I would like to use Username and name too.
                        if(!err && users){
                            ws.send(JSON.stringify({
                                type: 'GOT_USERS',
                                data: {
                                    users: users
                                },
                            }))
                        }
                    });
                    break;
                case 'FIND_THREAD':
                    models.Thread.findOne({where: {
                        and: [
                            {users: {like: parsed.data[0]}},
                            {users: {like: parsed.data[1]}}
                        ]
                    }}, (err, thread) => {
                        if(!err && thread) {
                            ws.send(JSON.stringify({
                                type: 'ADD_THREAD',
                                data: thread
                            }));
                        } else {
                            models.Thread.create({
                                lastUpdated: new Date(),
                                users: parsed.data
                            }, (err2, thread) => {
                                if(!err2 && thread) {
                                    clients.filter(u => thread.users.indexOf(u.id.toString()) > -1).map(client => {
                                        client.ws.send(JSON.stringify({
                                            type: 'ADD_THREAD',
                                            data: thread
                                        }));
                                    })
                                } else {
                                    ws.send(JSON.stringify({
                                        type: 'ERROR',
                                        error: err2
                                    }));
                                }
                            })
                        }
                    })
                    break;
                default: 
                    console.log('Nothing to see here');
            }
        }
    });
})