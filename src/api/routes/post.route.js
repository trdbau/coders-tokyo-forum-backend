const express = require('express');
const validate = require('express-validation');
const multer = require('multer');

const postController = require('../controllers/post.controller');
const authorization = require('../../middlewares/authorize');

const router = express.Router();
var storage = multer.diskStorage({
  filename: function(req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

router
  .route('/')
  .post(
    authorization.checkAccessToken,
    upload.single('coverImage'),
    postController.createPost,
  );

module.exports = router;