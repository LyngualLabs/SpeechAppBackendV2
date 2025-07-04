import { Request, Response } from 'express';
import { User } from '../models/User';
import { RegularRecording } from '../models/RegularRecordings';
import { IUser } from '../interfaces/IUser';

// Get all users with recording count using aggregation
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.aggregate([
      {
        $lookup: {
          from: 'regularrecordings', // collection name (lowercase, pluralized)
          localField: '_id',
          foreignField: 'user',
          as: 'recordings'
        }
      },
      {
        $project: {
          id: '$_id',
          fullname: 1,
          email: 1,
          'personalInfo.gender': 1,
          regularRecordingsCount: { $size: '$recordings' },
          _id: 0 
        }
      }
    ]);
    
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

// Create a new user
export const createUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }
    
    // Create new user
    const newUser = new User({
      name,
      email,
      password, // Note: In a real app, you should hash this password
    });
    
    const savedUser = await newUser.save();
    res.status(201).json(savedUser);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};