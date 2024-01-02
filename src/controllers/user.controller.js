import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudnary.js";

const genrateAccessAndRefereshToken = async (userId) => {
  try {
    const user = await User.findById(userId);

    const accessToken = user.genrateAccessToken();
    const refreshToken = user.genrateRefreshToken();

    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something Went Wrong While Genrating Your Token's -_-"
    );
  }
};

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

  const existedUser = await User.findOne({
    $or: [{ userName }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User is Allready exist");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  // if coverImage doesen't provided
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  //   let coverImageLocalPath;
  //   if (
  //     req.files &&
  //     Array.isArray(req.files.coverImage) &&
  //     req.file.coverImage.length > 0
  //   ) {
  //     coverImageLocalPath = req.file.coverImage[0].path;
  //   }
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

const loginUser = asyncHandler(async (req, res) => {
  /*
     1) Take email ,username and password from user [req.body]
     2) verify that email ,username and password to db
     3) if not found then throw error
     4) if found then check passowrd
     5) then  genrate and acces token and referesh token 
     6) after genrating the token send them on cokiees
    */

  const { email, userName, password } = req.body;

  if (!userName && !email) {
    throw new ApiError(400, "Username or Emaill is required");
  }

  const user = await User.findOne({
    $or: [{ userName }, { email }],
  });

  if (!user) {
    throw new ApiError(400, "User Doesnot exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Passowrd Incorrect");
  }

  const { refreshToken, accessToken } = await genrateAccessAndRefereshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  //? making cokkie secure now cokkie will only modify by the server only not the client side
  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "User logged In Succesfully"
      )
    );

  // * We sending data = loggedInUser, accessToken, refreshToken its a type of edge case suppose frontend devloper want to save in localStroage Or you forntend team devloping mobile application so there is no option of the cokkies
});

const logoutUser = asyncHandler(async (req, res) => {
  /* 
  1) remove all the cokiie
  2) remove the refreshToken  from the Db also 
  */

  const userId = req.user._id;

  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Logout"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  try {
    const incomingRequestToken =
      req.cookie.refreshToken ||
      req.body.refreshToken ||
      req.headers.refreshToken;

    if (!incomingRequestToken) {
      throw new ApiError(401, "unauthorized request");
    }

    const decodedToken = await jwt.verify(
      incomingRequestToken,
      process.env.REFERESH_TOKEN_SECRET
    );

    const userId = decodedToken?._id;

    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(401, "no user found or Invalid Refresh token");
    }

    if (incomingRequestToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await genrateAccessAndRefereshToken(userId);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Acces Token Refreshed Succesfully"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Refresh Token");
  }
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };
