# Martin Holdrege

# Script started 9/21/2022

# Purpose, compile the combined wildland fire dataset polygons,
# such that new polygons are made for overlapping areas. 

# Note: at this point--this script isn't working, creating new transecting
# polygons (i.e. multiple burns), isn't functing because of issues with the polygons
# which I haven't been able to solve. This is a know failure point
# of the underlying geospatial GEOS library. 

# dependencies ------------------------------------------------------------

library(sf)
library(tidyverse)

# constants ------------------------------------------------------------

crs_target <- 5070 # target crs

# read in data ------------------------------------------------------------

# for bbox to use
suid1 <- terra::rast("data_raw/GeoTiffs_suid/gsu_masked_v20220314.tif")


path_cwf <- "../cheatgrass_fire/data_raw/combined_wildland_fire_dataset/Fire_Feature_Data_ArcMap10x.gdb/Fire_Feature_Data_v10.gdb"

cwf0 <- read_sf(dsn = path_cwf, layer = 'USGS_Wildland_Fire_Combined_Dataset')


# processing  ---------------------------------------------------------------


# * cropping & filtering ----------------------------------------------------

cwf1 <- cwf0 %>% 
  #st_transform(crs = crs_target) %>% 
  # convert all geometry types to MULTIPOLYGON
  # (one is multisurface at the moment)
  # (cwf3)
  st_cast('MULTIPOLYGON') %>% 
  st_make_valid()

# cropping
bbox1 <- st_bbox(suid1)
st_crs(bbox1)

# make sure bbox has same crs as the vector data
bbox2 <- st_bbox(
  st_transform(
    st_as_sfc(bbox1), 
    st_crs(cwf1)
  )
)
# st_crs(bbox2)

# st_crs(cwf1)


# keep only years of interest
# for now--holding onto the prescribed fires as well. 
names(cwf1)
cwf2a <- cwf1 %>% 
  filter(Fire_Year >= 1984, Fire_Year <= 2020) %>% 
  st_crop(bbox2) 

cwf2 <- cwf2a %>% 
  st_make_valid()

area <- st_area(cwf2)
sum(as.numeric(area) < 10^4)


cwf3 <- cwf2 %>% 
  st_simplify(preserveTopology = FALSE, 
              dTolerance = units::set_units(100, "meters")) %>% 
  st_make_valid() %>% 
  lwgeom::st_snap_to_grid(units::set_units(100, "meters")) %>% 
  st_set_precision(units::set_units(100, "meters")) %>% 
  mutate(area_m2 = as.numeric(st_area(.))) %>% 
  filter(area_m2 > 0) %>% 
  st_make_valid() # %>% 
  # this helps in some cases but also doesn't solve the problem
  # st_buffer(dist = units::set_units(1, "meters"))

nrow(cwf3)


# summaries ---------------------------------------------------------------

within1 <- st_within(cwf2)
overlaps1 <- st_overlaps(cwf2)
contains1 <- st_contains(cwf2)

overlaps_n <- map_dbl(overlaps1, length)
within_n <- map_dbl(within1, length)
contains_n <- map_dbl(contains1, length)

# polygons that are not overlapping any others in some way
isolated <- overlaps_n == 0 & within_n == 1 & contains_n == 1

mean(isolated)

max(overlaps_n)
# * intersections ---------------------------------------------------------



# 'i' added to object name to denote intersections
cwfi1 <- st_intersection(cwf3[, ])
st_difference(cwf3) # testing
cwfi2 <- st_make_valid(cwfi1)
cwf3 %>% 
  st_buffer(-30) %>% 
  st_buffer(30) %>% 
  # not sure if this might help
  #st_snap(x = ., y = ., tolerance = units::set_units(100, 'meters')) %>% 
  st_make_valid() %>% 
  st_intersection()
x <- cwfi1 %>% 
  arrange(desc(n.overlaps)) %>% 
  #.[1:20, ] %>% 
  .$Shape 

st_area(x)


# finding problem polygons ------------------------------------------------


# st_intersection_safely <- possibly(st_intersection, otherwise = NULL)
# # for (i in seq(from = 1, to = nrow(cwf3), by = 500)) {
# for (i in seq(from = 8450, to = 8465, by = 25)) {
#   df <- cwf3[1:i, ]
#   x <- st_intersection_safely(df)
#   print(i)
#   if(is.null(x)) {
#     break
#   }
#   
# }


n <- 8467
bb <- st_bbox(cwf3[n, ])

# ggplot(cwf3[n, ]) +
#   geom_sf(color = 'blue')  +
#   geom_sf(data = cwf3[1:(n-1), ]) +
#   coord_sf(xlim = as.numeric(bb[c("xmin", 'xmax')]),
#            ylim = as.numeric(bb[c("ymin", 'ymax')]))+
#   ggspatial::annotation_scale()

y <- 1000
x2 <- st_crop(cwf3, 
              xmin = as.numeric(bb['xmin']) - y,
              xmax = as.numeric(bb['xmax']) + y,
              ymin = as.numeric(bb['ymin']) - y,
              ymax = as.numeric(bb['ymax']) + y) %>% 
  st_make_valid()

st_intersection(x2[c(2, 21), ])
nrow(x2)
plot(st_geometry(x2))

# for (i in seq(from = 21, to = 1, by = -1)) {
#   df <- x2[i:nrow(x2), ]
#   x <- st_intersection_safely(df)
#   print(i)
#   if(is.null(x)) {
#     break
#   }
# }

to_keep <- st_crop(x2[2:21, ], x2[2, ]) %>% 
  pull(USGS_Assigned_ID)

x3 <- cwf3 %>% 
  filter(USGS_Assigned_ID %in% to_keep)

st_intersection(x3[c(1, 3, 4, 6), ])

x3i <- st_intersection(x3[c(1, 3, 6, 4), ]) %>%  # order matters
  st_make_valid() 

st_within(x3i)
st_contains(x3i)
st_overlaps(x3i) # unclear why this is not giving all 0s

st_within(x3)
st_contains(x3)
st_overlaps(x3) # unclear why this is not giving all 0s
x4 <- x3[c(1, 3, 4, 6), ]
st_intersection(x3[c(3, 4, 1, 6), ])

ggplot(x4) +
  geom_sf() +
  facet_wrap(~USGS_Assigned_ID)

x4s <- st_snap(x4, x4, tolerance = units::set_units(100, 'meters'))
st_overlaps(x = st_intersection(x3[c(1, 3, 6, 4), ]), sparse = F)

ggplot(x4) +
  geom_sf(aes(color = as.factor(USGS_Assigned_ID)), fill = NA)

ggplot(x4s) +
  geom_sf(aes(color = as.factor(USGS_Assigned_ID)), fill = NA)
st_intersection(x4s)
st_intersects(x4)
x5 <- x4
x5$Shape[4]
# x5$Shape[[4]] <- st_geometry(st_as_sfc(st_bbox(x5$Shape[4])))[[1]]
plot(x4$Shape[[4]])
x5$Shape[[4]] <- st_simplify(x4$Shape[[4]], dTolerance = 300)
st_intersection(x4)
st_intersection(x5)


ggplot(x4) +
  geom_sf(aes(color = as.factor(USGS_Assigned_ID)), fill = NA) +
  geom_sf(data = x5[4, ], color = 'black', fill = NA)

ggplot(st_buffer(x4, 0))+
  geom_sf(fill = NA)
for (i in seq(from = 2, to = 54, by = 1)) {
  df <- x2[2:i, ]
  x <- st_intersection_safely(df)
  print(i)
  if(is.null(x)) {
    break
  }
}


plot(st_geometry(x2[21, ]), col = 'blue')
plot(st_geometry(x2[1:20, ]), add = TRUE) 
for (i in 1:10) {
  
  if(i > 5) {
    print(i)
    break
  }
}
# ** code testing ---------------------------------------------------------
# reproducible example
if (FALSE) {
  set.seed(131)
  
  m = rbind(c(0,0), c(1,0), c(1,1), c(0,1), c(0,0))
  p = st_polygon(list(m))
  p2 <- st_polygon(list(m/2 + 0.2))
  n = 5
  l = vector("list", n)
  for (i in 1:n) {
    r <- runif(2, 0, 1.2)
    l[[i]] = p + 3 * r
  }
  
  l[[n+1]] <- p2 + 3*r #(polygon inside another)

    
  
  s = st_sfc(l)
  
  sf = st_sf(s)
  sf$id <- letters[1:nrow(sf)]
  # row.names(sf) <- sf$id # this didn't help
  i = st_intersection(sf) # all intersections
  print(i)
  plot(i$s)
  
  i$origins_id <- map(i$origins, function(x) sf$id[x])
  
  i2 <- i %>% 
    filter(n.overlaps > 1)
  i3 <- i %>% 
    filter(n.overlaps ==1)
  st_intersects(i) # thse aren't useful
  st_touches(i) # 
  
  # these are good
  st_within(sf)
  st_crosses(sf)
  st_contains(sf)
  st_overlaps(sf)
  st_within(i)

  st_contains(i)
  st_overlaps(i)
  par(mfrow = c(2, 2))
  plot(sf$s,  col = sf.colors(categorical = TRUE, alpha = .5),
       main = "original polygons")
  plot(i$s, col = sf.colors(categorical = TRUE, alpha = .5),
       main = "all polygons")
  plot(i2$s, col = sf.colors(categorical = TRUE, alpha = .5),
       main = 'just overlapping')
  plot(i3$s, col = sf.colors(categorical = TRUE, alpha = .5),
       main = 'non overlapping')
}