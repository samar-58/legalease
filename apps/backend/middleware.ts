import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"
import { JWT_PUBLIC_KEY } from "./config";


export function authMiddleware(req : Request , res : Response , next : NextFunction) {
  const token = req.headers["authorization"]
  if(!token) {
    res.status(400).json({error : "Invalid token"})
    return 
  }
  const decoded = jwt.verify(token , JWT_PUBLIC_KEY)
  if(!decoded || !decoded.sub) {
    res.status(400).json({error : "Decoded fail"})
    return 
  }

  req.userId = decoded.sub as string

  next()
}