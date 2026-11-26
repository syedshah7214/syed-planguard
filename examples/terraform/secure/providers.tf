terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.73"
    }
  }
}

# CI produces a plan WITHOUT any AWS account: placeholder credentials and
# skipped account lookups. Nothing here can create real resources.
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "planguard-ci-placeholder"
  secret_key                  = "planguard-ci-placeholder"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
}
