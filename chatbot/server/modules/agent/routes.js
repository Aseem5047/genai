import express from "express";
import { useChatController } from "./chat.controller.js";

const router = express.Router();

router.post("/", useChatController);

export default router;