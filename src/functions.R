# R functions used in other scripts in this repository

# * determine yrs burned from bin -----------------------------------------

#' convert 'binary' code to which year(s) burned
#' 
#' @description the number is converted to binary, where 1's represent
#' years that burned, and 0's represent years that didn't burn. The issue
#' is that the input can be up to 2^35, but R integers can only handle
#' 2^32, so here the integer is converted into the floating point
#' representation (with up to 2^53 precision) and then from that the 
#' binary representation of integer is reconstructed
#'
#' @param x the up to 11 digit 'binary' code of which years burned
#' @param yearStart start year of the sequence
#' @param yearEnd  end year
#'
#' @return vector giving the calendar years that burned, based
#' on converting x to binary
#
#' @examples
#' bin_years_burned(1)
#' bin_years_burned(2^0+ 2^1+ 2^34)# burned in years 1, 2, and 35
bin_years_burned <- function(x, yearStart = 1986, yearEnd = 2020) {
  
  # see https://www.ece.unb.ca/tervo/ee6373/IEEE64.htm for how 64 bit
  # floating point numbers are encoded
  bits64 <- numToBits(x)
  
  if(x==0) {
    return(numeric())
  }
  stopifnot(x>=1 & x <2^35) # this is the range I should be working with
  
  
  bits_mantissa <- rev(bits64[1:52]) # the mantissa (reversing b/ for ease 
  # of use so that can read left to right (where the first 1 encountered
  # is the first year that burned))
  
  # in the mantissa the leading 1 is assumed to be there. 1 ie 1.101 is 101,
  # so the the 
  
  
  years <- yearStart:yearEnd
  n <- length(years)
  stopifnot(length(years) <= 35)
  
  
  
  # exponent portion
  bits_exp <- bits64[53:63]
  bits_0_32 <- intToBits(0) # 32 bit represention of the integer 0
  # 32 bit representation of the exponent
  exponent_32 <- bits_0_32
  exponent_32[1:11] <- bits_exp
  
  # converting to base 10 then subtracting 1023 because it is a 'biased' exponent
  exponent <- packBits(exponent_32, type = "integer") - 1023
  exponent
  # the must have a positive exponent
  # my 'algorithm' here only works for integers >=1 so
  stopifnot(exponent >= 0)
  
  # here add exponent number of leading 0s, this is the number
  # places you are moving the decimal point to the left
  # this is now the binary representation (except direction flipped)
  # the integer
  
  keep <- if(exponent == 0) {
    0
  } else {
    1:exponent
  }
  binary_integer <- c(1, as.numeric(bits_mantissa)[keep])
  
  
  # logical vector did a given year burn
  did_burn <- rep(FALSE, n)
  
  did_burn[1:length(binary_integer)] <- rev(as.logical(binary_integer))
  # which calendar years burned
  years_burned <- years[did_burn]
  
  years_burned
}


#' convert a single integer to base 6
#' 
#' @description used in base2severity function, defined below
#'
#' @param x integer
#'
#' @return string where fire severity of each fire is returned (values from 1-5)
#' with _ seperating the firest

#' @examples
#' base2severity_single(7)
#' base2severity(4385)
base2severity_single <- function(x ) {
  stopifnot(length(x) == 1,
            is.numeric(x))
  
  # base2base function doesn't seem to work for 0s
  if(x == 0) return("")
  
  if(x < 6) return(as.character(x))
  
  out_list <- cgwtools::base2base(x, frombase = 10, tobase = 6)
  
  # reverse order so that the first spot is fire severity of the 
  # first fire, 2nd spot is severity of 2nd fire and so on
  out <- paste(rev(out_list[[1]]), collapse = "_")
  out
}

#' convert numbers to fire severity order
#'
#' @param x numeric vector of base 10 numbers that should
#' be convert to base 6
#'
#' @return character vector, where each element gives the order of 
#' fire severities
#' @examples
#' base2severity(c(3152, 1, 8, 0))
base2severity <- function(x) {
  
  out <- map_chr(x, base2severity_single)
  
  out
}


#' check that two vectors contain the same elements
#'
#' @param x vector
#' @param y vector
#'
#' @return logical
#' @examples
#' same_elements(1:2, c(2:1, 2))
#' same_elements(1:3, 1:2)
same_elements <- function(x, y) {
  all(x %in% y) & all(y %in% x)
}

