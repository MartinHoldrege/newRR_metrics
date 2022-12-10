/*
Purpose: reproject suid image so that is is
has the USA_Contiguous_Albers_Equal_Area_Conic_USGS_version
projection. which is what MTBS used (to hopefully alleviate
some projection mismatch issues)

Author: Martin Holdrege

Date Started: 12/9/2022
*/

// dependencies

var fns = require("users/mholdrege/newRR_metrics:src/functions.js");

// constants
var pathAsset = 'projects/gee-guest/assets/newRR_metrics/';

// read in data
var suid1 = ee.Image(pathAsset + 'suid/gsu_masked_v20220314')
  .rename('suid');
  
var region = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019") // provided by DT 
  .geometry();
// save file

  Export.image.toAsset({
    image: suid1,
    assetId: pathAsset + 'suid/gsu_masked_v20220314_wktUSGS',
    description: 'suid',
    maxPixels: 1e13, 
    scale: 30,
    region: region,
    crs: fns.wktUSGS
  });