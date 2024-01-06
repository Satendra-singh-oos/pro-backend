import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudnary.js";
import mongoose from "mongoose";

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
      req.cookies.refreshToken ||
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

const changeCurrentPassword = asyncHandler(async (req, res) => {
  /*
   1) userId ->token will give
   2) newPassword -> req.body
   3) do hashing(automatin before saving the custom hook is called) on passowrd and then save
  */

  const { oldPassword, newPassword } = req.body;

  const userId = req.user?._id;

  const user = await User.findById(userId);

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid Old Passowrd");
  }

  user.password = newPassword;

  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password Updated Succesfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  // const userId = req.user._id;

  // const user = await User.findById(userId).select("-password -refreshToken");

  // if (!user) {
  //   throw new ApiError(400, "No User Found");
  // }

  // return res
  //   .status(200)
  //   .json(new ApiResponse(200, { user }, "User Details send succesfully"));

  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User Details send succesfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  try {
    const { fullName, email } = req.body;

    if (!(fullName || email)) {
      throw new ApiError(400, "all fields are required");
    }

    const userId = req.user?._id;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          fullName,
          email,
        },
      },
      { new: true }
    ).select("-password  -refreshToken");

    if (!user) {
      throw new ApiError(400, "Unable to update the user");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Account details updated succesfulyl"));
  } catch (error) {
    throw new ApiError(500, "Error during update the account details");
  }
});

//TODO:Create update avatar and coverImage controller and route

const updateUserAvatar = asyncHandler(async (req, res) => {
  /*
   1) get file from req.file
   2)
   */

  const avtarLocalPath = req.file?.path;

  if (!avtarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  const avatar = await uploadOnCloudinary(avtarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error While uploading Avatar");
  }

  const userId = req.user?._id;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    { new: true }
  ).select("-password -refreshToken");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "updated user avatar succesfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  try {
    const coverImageLocalPath = req.file?.path;

    if (!coverImageLocalPath) {
      throw new ApiError(400, "unable to update the local path");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage.url) {
      throw new ApiError(400, "unable to get cloudnairy url");
    }

    const userId = req.user?._id;
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          coverImage: coverImage.url,
        },
      },
      { new: true }
    ).select("-password ");

    return res
      .status(200)
      .json(new ApiResponse(200, user, "updated user coverImage succesfully"));
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong during updation of cover image"
    );
  }
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  try {
    const { userName } = req.parmas;

    if (!userName?.trim()) {
      throw new ApiError(400, "username is missing");
    }

    const channel = await User.aggregate([
      {
        $match: {
          userName: userName?.toLowerCase(),
        },
      },
      {
        $lookup: {
          from: "subscription",
          localField: "_id",
          foreignField: "channel",
          as: "subscribers",
        },
      },

      {
        $lookup: {
          from: "subscription",
          localField: "_id",
          foreignField: "subscriber",
          as: "subscribedTo",
        },
      },

      {
        $addFields: {
          subscriberCount: {
            $size: "$subscribers",
          },
          channelsSubscribedToCount: {
            $size: "$subscribedTo",
          },
          isSubscribed: {
            $cond: {
              if: { $in: [req.user?._id, "$subscribers.subscriber"] },
              then: true,
              else: false,
            },
          },
        },
      },

      {
        $project: {
          fullName: 1,
          userName: 1,
          subscriberCount: 1,
          channelsSubscribedToCount: 1,
          isSubscribed: 1,
          avatar: 1,
          coverImage: 1,
          email: 1,
        },
      },
    ]);

    if (!channel?.length) {
      throw new ApiError(400, "channle doese not exist");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(200, channel[0], "User Channel Fetched Succesfully")
      );
  } catch (error) {
    throw new ApiError(
      500,
      error?.message,
      "SomeThing Went in the Geting User Channel Profile "
    );
  }
});

const getWatchHistory = asyncHandler(async (req, res) => {
  try {
    const user = await User.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(req.user?._id),
        },
      },
      {
        $lookup: {
          from: "video",
          localField: "watchHistory",
          foreignField: "_id",
          as: "watchHistory",
          pipeline: [
            {
              $lookup: {
                from: "user",
                localField: "owner",
                foreignField: "_id",
                as: "owner",

                pipeline: [
                  {
                    $project: {
                      fullName: 1,
                      userName: 1,
                      avatar: 1,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                owner: {
                  $first: "$owner",
                },
              },
            },
          ],
        },
      },
    ]);

    if (!user?.length) {
      throw new ApiError("400", "No User Found ");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          user[0].watchHistory,
          "Watch history fetched successfully"
        )
      );
  } catch (error) {
    throw new ApiError(
      500,
      "Something Went Wrong when getting user watch history"
    );
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
};
