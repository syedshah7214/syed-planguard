# Deliberately INSECURE and EXPENSIVE example — PlanGuard must FAIL this plan.
# Do not apply this configuration.

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
}

resource "aws_security_group" "web" {
  name   = "web"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # SSH open to the world
  }
}

resource "aws_instance" "app" {
  ami                    = "ami-0abcdef1234567890"
  instance_type          = "m5.xlarge"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.web.id]

  root_block_device {
    volume_size = 100
    volume_type = "gp2"
    encrypted   = false
  }
}

resource "aws_db_instance" "main" {
  identifier             = "startup-db"
  engine                 = "postgres"
  instance_class         = "db.t3.medium"
  allocated_storage      = 100
  username                    = "app"
  manage_master_user_password = true # password generated and stored in Secrets Manager
  multi_az               = true
  publicly_accessible    = true
  storage_encrypted      = false
  skip_final_snapshot    = true
  backup_retention_period = 0
}

resource "aws_s3_bucket" "uploads" {
  bucket = "planguard-example-uploads"
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public.id
}

resource "aws_iam_policy" "admin" {
  name = "app-admin"
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "*", Resource = "*" }]
  })
}
