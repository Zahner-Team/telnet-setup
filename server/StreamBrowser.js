// server/index.js

// const express = require("express/index.js");
import express from 'express/index.js'
// const bodyParser = require('body-parser');
import bodyParser from 'body-parser'
// const cors = require("cors");
import cors from 'cors'
// import {app} from '../index.js'

export const expressServer = (data) => {
  // const app = express()
  // app.use(cors())

  // const PORT = process.env.PORT || 3002;
  // // Configuring body parser middleware
  // app.use(bodyParser.urlencoded({ extended: false }))
  // app.use(bodyParser.json())

  // Have Node serve the files for our built React app
  // app.use(express.static(path.resolve(__dirname, '../client/build')));

  // app.get('/api', (req, res) => {
  //   res.json({ message: 'Hello from server!' })
  //   console.log(req)
  // })

  console.log('data', data)

  app.use('/api/button', function (req, res) {
    console.log('api stream')

    res.json({ message: 'data' })
    // res.json({ message: data })
  })

  // app.listen(PORT, () => {
  //   console.log(`Server listening on ${PORT}`);
  // });

  
}

