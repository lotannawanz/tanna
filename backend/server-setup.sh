#!/bin/bash
# Tanna Backend Server Setup Script
# Run this after SSH into the EC2 instance

set -e  # Exit on error

echo "=== Tanna Server Setup ==="

# Update system
echo "1. Updating system packages..."
sudo dnf update -y

# Install Node.js 20
echo "2. Installing Node.js 20..."
sudo dnf install -y nodejs20 npm

# Verify Node version
node --version
npm --version

# Install Git
echo "3. Installing Git..."
sudo dnf install -y git

# Install PM2
echo "4. Installing PM2..."
sudo npm install -g pm2

# Create app directory
echo "5. Setting up application directory..."
mkdir -p ~/tanna
cd ~/tanna

# Clone the repository (you may need to set up git credentials or use HTTPS)
echo "6. Cloning repository..."
# Uncomment and modify based on your repo:
# git clone https://github.com/YOUR_USERNAME/tanna.git .
# OR copy files via SCP

echo "=== Manual Steps Required ==="
echo ""
echo "1. Copy your backend code to this server:"
echo "   scp -i tanna-staging-key.pem -r ./backend/* ec2-user@34.244.247.193:~/tanna/"
echo ""
echo "2. Create .env.staging file with your database URL and Paystack keys"
echo ""
echo "3. Run the following commands:"
echo "   cd ~/tanna"
echo "   npm install"
echo "   npm run db:generate"
echo "   npx prisma migrate deploy"
echo "   npm run build"
echo "   NODE_ENV=staging pm2 start dist/index.js --name tanna"
echo ""
echo "4. Test health endpoint:"
echo "   curl http://localhost:3000/health"
echo ""
echo "=== Setup script complete ==="
