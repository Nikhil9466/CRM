const express = require("express");
const upload = require("../config/upload");
const {
  validateSignup,
  validateLogin,
  validateResetPassword,
} = require("../middleware/validate");
const {
  signup,
  login,
  resetPassword,
} = require("../controllers/authController");

const router = express.Router();

router.post("/signup", upload.single("photo"), validateSignup, signup);
router.post("/login", validateLogin, login);
router.post("/reset-password", validateResetPassword, resetPassword);

module.exports = router;
