const mongoose = require("mongoose");
const User = require("../models/User");
const Business = require('../models/businessModel');

const buildListQuery = (role, userId) => {
  if (role === "admin") return {};
  if (role === "student" || role === "alumni") {
    return {
      $or: [
        { status: "approved" },
        { postedBy: new mongoose.Types.ObjectId(userId) },
      ],
    };
  }
  return { status: "approved" };
};
exports.createBusiness = async (req, res) => {


  try {

    const { name, location, category, description, contact_email, contact_phone } = req.body;
   
    // const names = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    // const existing = await Business.findOne({ req.body });
    // if (existing) {
    //   return res.status(400).json({ error: 'A business with this name already exists.' });
    // }
    const status = "pending";

    const business = await Business.create({
      name: name.trim(),
      location: location,
      category: category,
      description: description.trim(),
      contact_email: contact_email,
      contact_phone: contact_phone,
      status,
      posted_by: req.user.userId,

      
    });

    res.status(201).json({ success: true, business: "business" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyBusinesses = async (req, res) => {
  try {
    // console.log(req.user);
    const ownerId = req.user.userId;
    const businesses = await Business.find({ posted_by: ownerId });
    // // console.log(businesses.name);
    res.status(200).json(businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getBusiness = async (req, res) => {
  try {

    const business_id = req.params.business_id;
    const business = await Business.find({ _id: business_id });
    res.status(200).json(business);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllBusinesses = async (req, res) => {
  try {
    const businesses = await Business.find().sort({ createdAt: -1 });
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateBusiness = async (req, res) => {
  console.log("files", req.files, req.params.business_id);
  // next();
  const updatedData = {
    ...req.body,
  }

  const logo = req.files?.logo?.[0];
  const banner = req.files?.banner?.[0];
  console.log(req.body);
  updatedData.banner = logo? `/uploads/${logo.name}`: undefined;
  updatedData.logo = banner? `/uploads/${banner.name}`: undefined;

 
  const business = await Business.findByIdAndUpdate(req.params.business_id, { $data: updatedData }, {
    new:true
  });
  if (!business) {
    return res.status(404).json({ success: false, message: "Business not found" });
  }

  return res.status(200).json({ success: true, message: "Business found" });

}