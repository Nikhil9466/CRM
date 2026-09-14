const express = require("express");
const upload = require("../config/upload");
const { validateSignup, validateLogin } = require("../middleware/validate");
const { signup, login } = require("../controllers/authController");

const router = express.Router();

router.post("/signup", upload.single("photo"), validateSignup, signup);
router.post("/login", validateLogin, login);

module.exports = router;
