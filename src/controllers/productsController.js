const mongoose = require("mongoose");
const User = require("../models/User");
const Products = require('../models/productsModel');
const Business = require('../models/businessModel');

exports.createProduct = async (req, res) => {
  try {
    // console.log(req.body);
    // const { businessId } = req.params;
    const { businessId, name, price, quantity, category, description, imageUrl, inStock, status } = req.body;

    const business = await Business.findById(req.body.businessId);
    if (!business) {
      return res.status(404).json({ error: 'Target business not found.' });
    }

    const product = await Products.create({
      businessId: businessId,
      name: name,
      price: price,
      quantity: quantity,
      category: category,
      description: description,
      imageUrl,
      inStock,
      status
    });

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAggregatedProducts = async (req, res) => {
  try {
    const { search, businessId, category, maxPrice, inStockOnly } = req.query;

    const queryFilter = {};

    if (search) {
      queryFilter.$text = { $search: String(search) };
    }

    if (businessId && businessId !== 'all') {
      queryFilter.businessId = businessId;
    }

    if (category && category !== 'all') {
      queryFilter.category = category;
    }

    if (maxPrice) {
      queryFilter.price = { $lte: Number(maxPrice) };
    }

    if (inStockOnly === 'true') {
      queryFilter.inStock = true;
    }

    const products = await Product.find(queryFilter)
      .populate('businessId', 'name phone logoUrl location')
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyProducts = async (req, res) => {

  try{
    const ownerId = req.user.userId;
    // console.log(ownerId);
    const businesses = (await Business.find({posted_by: ownerId}).select('_id'));
    console.log(businesses);
    const businessesIds = businesses.map(business => business._id);
    console.log(businessesIds);
    const products = await Products.find({ businessId: { $in: businessesIds } }).populate("businessId");    
    console.log(products);
    res.status(200).json(products);
    
  }catch (error){
    res.status(500).json({ error: error.message});
  }

};

exports.getProduct = async (req, res) => {
  try {
    const product_id = req.params.product_id;
    const product = await Products.find({ _id: product_id }).populate("businessId", "name contact_phone");
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getBusinessProducts =async (req, res) => {
  try{
    const { business_id} = req.params;
    console.log('business products');

    const products = await Products.find({ businessId: business_id}).populate("businessId", "name contact_phone");
    res.status(200).json(products);
  }catch(error){
    res.status(500).json({error: error.message});
  }
}

exports.updateProduct = async (req, res) => {
  const product = await Products.findByIdAndUpdate(req.params.product_id, req.body, {
    new:true
  });
  if (!product) {
    return res.status(404).json({ success: false, message: "Product not found" });
  }

  return res.status(200).json({ success: true, message: "Product found" });

}