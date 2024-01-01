import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudnary.js";

const registerUser = asyncHandler(async (req, res) => {
  // Step 1 : Need user details like email ,username, firstname,avtar...etc
  // Step 2 : Validation
  // Step 3 : check if user already exist in db or not (with username and email)
  // Step 4 :check for image check for avtart then upload to the cloudinary
  // Step 4 : if user is not avaliable then create new user object in db
  // Step 5 : return the response of success with some data like [not sending refresh token and password]

  const { userName, email, fullName, password } = req.body;

  if (
    [fullName, email, userName, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All field is required");
  }

  const existedUser = User.findOne({
    $or: [{ userName }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User is Allready exist");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar fill is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar File Faild Fill Again");
  }

  const user = await User.create({
    userName,
    fullName,
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const userId = user._id;

  const createdUser = await User.findById(userId).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registring the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Register Sucesfully"));
});

export { registerUser };
