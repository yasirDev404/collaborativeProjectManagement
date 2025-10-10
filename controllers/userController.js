import User from "../models/userModel.js";
import { userValidationSchema } from "../utilities/validation.js";
import { successHelper, errorHelper,generateToken } from "../utilities/helpers.js";


const registerUser = async (req, res) => {
  const {email} = req.body;
  if(!email){
    return errorHelper(res, null, "Email is required", 400);
  }
  const existingUser = await User.findOne({email});
  if(existingUser){
    return errorHelper(res, null, "User already exists", 400);
  }
  try{
       
  } catch {

  }
}

export default createUser;
