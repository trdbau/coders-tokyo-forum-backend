const express = require('express');
const { UserController } = require('@controllers')
const { checkAccessToken } = require('@middlewares/authorize');
const {
  updateProfileValidate,
  uploadAvatarValidate,
} = require('../validations/user');
const router = express.Router();


const { avatarConfig } = require('@configVar')
const { configStorage } = require('../../config/cloudinary')
const upload = configStorage(avatarConfig)

router
  .route('/:userId')
  .get(checkAccessToken, UserController.getOne);
router
  .route('/:userId')
  .put(checkAccessToken,
    updateProfileValidate,
    UserController.updateProfile
  );
router
  .route('/avatars')
  .post(
    checkAccessToken,
    uploadAvatarValidate,
    upload.single('path'),
    UserController.uploadAvatar,
  );
router
  .route('/avatars')
  .delete(checkAccessToken, UserController.deleteAvatar);

router
  .route('/:username')
  .get(UserController.getByUsername);

module.exports = router;
