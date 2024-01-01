import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_CLOUD_KEY,
  api_secret: process.env.CLOUDINARY_CLOUD_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) {
      return null;
    }
    // upload the file in coloudnary

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // file has been uploded succesfully
    console.log("file is uploaded on succefully", response.url);

    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // remove the file which is localy saved in our server as the uploading of file in cloudnairy is failed
    return null;
  }
};

export { uploadOnCloudinary };
