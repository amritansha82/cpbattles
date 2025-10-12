import jwt from "jsonwebtoken";
import { verificationService } from "../services/verificationService";
import { RequestHandler } from "express";

export const verifyUser: RequestHandler = async (req, res) => {
  const { handle } = req.body;

  try {
    const result = await verificationService.initiateVerification(handle);
    res.json(result);
  } catch (error) {
    console.log(error);
    res.status(404).json({
      error:
        "message" in (error as any) ? (error as any).message : "Unknown error",
    });
  }
};

export const checkSubmission: RequestHandler = async (req, res) => {
  const { handle } = req.body;

  try {
    const result = await verificationService.checkVerification(handle);

    if (result.verified) {
      const token = jwt.sign(
        { handle: result.user.handle, id: result.user.id },
        process.env.JWT_SECRET || "default",
        { expiresIn: "90d" }
      );

      res.json({
        verified: true,
        jwt: token,
      });
    } else {
      throw new Error("Submission not found or not valid. Please try again.");
    }
  } catch (error) {
    res.status(500).json({
      error:
        "message" in (error as any) ? (error as any).message : "Unknown error",
    });
  }
};

export const getMe: RequestHandler = async (req, res) => {
  res.json({
    // @ts-ignore
    id: req.user.id,
    // @ts-ignore
    handle: req.user.handle,
  });
};
