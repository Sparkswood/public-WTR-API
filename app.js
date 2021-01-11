require('./db/mongoose').resolve
require('dotenv').config()
const CommonResponse = require('./db/models/common-models/commonResponse')
const jwt = require('jsonwebtoken');

// HTTP SERVER
const express = require('express')
const PORT = process.env.PORT || 3000
const app = express()

// MIDDLEWARES <- THOSE ARE RUNNING ON EVERY REQUEST
const bodyParser = require('body-parser')
app.use(bodyParser.json({limit: '5mb'}))
app.use(bodyParser.urlencoded({limit: '5mb',extended: true}))

const auth = (req, res, next) => {
  const token = req.header('auth-token');
  if (!token) {
    error = new CommonResponse({
      success: false,
      message: 'Authorization failed'
    })
    return res.json(error);
  }
  try {
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);
    req.user = verified;
    next(); // to continue the flow
  } catch (err) {
    let error = new CommonResponse({
      success: false,
      message: 'Token is not valid'
    })
    res.json(error);
  }
};

// ROUTES
const projectsRoute = require('./routes/projects')
const tasksRoute = require('./routes/tasks')
const usersRoute = require('./routes/users')
const worklogerRoute = require('./routes/workloger')
const authenticationRoute = require('./routes/authentication')

app.use('/authentication', authenticationRoute)
app.use('/users', auth, usersRoute)
app.use('/projects', auth, projectsRoute)
app.use('/tasks', auth, tasksRoute)
app.use('/workloger', auth,  worklogerRoute)

app.listen(PORT)
module.exports = app;