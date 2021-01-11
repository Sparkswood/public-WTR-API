const express = require('express')
require('dotenv').config()
const router = express.Router()
const User = require('../db/models/user')
const CommonResponse = require('../db/models/common-models/commonResponse')
const request = require('request-promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt-nodejs')

//LOGIN WITH CREDENTIALS
router.post('/credentialsAuth', async (req, res) => {
    const response = await authenticateUser(req.body)
    if (response.success === true && response.details.firstName) {

        const token = await jwt.sign({
                name: response.details.firstName,
                role: response.details.role,
                id: response.details._id,
            },
            process.env.TOKEN_SECRET
        );

        res.header('auth-token', token).json(response)
    } else res.json(response)
    
})


const authenticateUser = async (credentials) => {
    try {
        let loggedUser = await User.findOne({login: credentials.login, active: true}, {facePhoto: 0, qrCode: 0, faceAIId: 0})
        let response = new CommonResponse()
        if (loggedUser && loggedUser.firstName) {
            let matchPassword = bcrypt.compareSync(credentials.password, loggedUser.password);
            if (matchPassword) {
                loggedUser.password = undefined
                response.success = true
                response.details = loggedUser
            } else {
                response.success = false
                response.message = 'Invalid credentials'
            }
        } else {
            response.success = false
            response.message = 'Invalid credentials'
        }
        return response
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

router.post('/faceAuth', async (req, res) => {
    let response = await recognizeFace(req.body.facePhoto)
    if (response.success === true && response.details.firstName) {

        const token = await jwt.sign({
                name: response.details.firstName,
                role: response.details.role,
                id: response.details._id,
            },
            process.env.TOKEN_SECRET
        );

        res.header('auth-token', token).json(response)
    } else res.json(response)
})

const recognizeFace = async (file) => {
    try {
        const options = {
            method: 'POST',
            url: 'https://luxand-cloud-face-recognition.p.rapidapi.com/photo/search',
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              'x-rapidapi-key': process.env.RAPID_API_KEY,
              'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
              useQueryString: true
            },
            form: {photo: `${file.split(',')[1]}`}
          };

        let result = await request(options, async (err, res, body) => {
            if (err) throw new Error(err.message);
        });

        let response = new CommonResponse()
        result = JSON.parse(result)
        if (result[0] && result.length < 2) {
            const id = result[0].id
            let loggedUser = await User.findOne({faceAIId: `${id}`, active: true}, {facePhoto: 0, qrCode: 0, password: 0, faceAIId: 0})
            if (loggedUser) {
                response.success = true
                response.message = result[0].probability
                response.details = loggedUser
            } else {
                response.success = false
                response.message = 'Face not recognized'
            }
        } else {
            response.success = false
            response.message = 'Face not recognized'
        }

        return response
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// LOGOUT
router.get('/logout', (req, res) => {
    try {
        let response = new CommonResponse({success: true})
        res.json(response)
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        res.json(error)
    }
})

module.exports = router