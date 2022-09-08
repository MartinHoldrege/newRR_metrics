/*
Script started 9/8/2022 by Martin Holdrege

Purpose--summarise landcover datasets by a classification raster (i.e. each pixel
belongs to one of ~100k unique soil units)

*/


// Constants

var dirAsset = 'projects/gee-guest/assets/newRR_metrics/';


/***************************

load the data 

****************************
*/

// suid--data layer from Daniel Schlaepfer. This is an 'id' layer, where each pixel
// has a number which corresponds to the nrcs soil unit polygon that it belongs to. 
// resolution is 30 m. Certain 'non drylands' have been masked out for this analysis. 

var suid1 = ee.Image(dirAsset + 'suid/gsu_masked_v20220314')
  .toInt(); // unique values so integer better?

Map.addLayer(suid1, {min: 0, max: 100000}, 'suid', false);

// region of interest

var biome = ee.FeatureCollection("projects/gee-guest/assets/SEI/US_Sagebrush_Biome_2019"); // provided by DT
var region = biome.geometry();

Map.addLayer(region, {}, 'roi', false);

// rap cover data

/*
These data represent an update to the rangeland cover estimates described in
Allred et al. (2021).

Band 1 - annual forb and grass
Band 2 - bare ground
Band 3 - litter
Band 4 - perennial forb and grass
Band 5 - shrub
Band 6 - tree

No Data value = 255
*/

var rapCov1 = ee.ImageCollection('projects/rangeland-analysis-platform/vegetation-cover-v3');

var rapCov2 = rapCov1.filterDate('2019-01-01', '2020-12-31').mean(); // for testing purposes just taking mean of last couple years

//print(rapCov2.bandNames())

/*

Prepare data for summarizing

*/

var rapCov3 = rapCov2.addBands(suid1.rename('suid'));

print(rapCov3)










