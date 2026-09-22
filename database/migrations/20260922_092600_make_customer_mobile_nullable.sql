-- Make customer mobile column nullable
ALTER TABLE `customers` MODIFY `mobile` VARCHAR(20) NULL DEFAULT NULL;
