### Backend
```bash
cd backend
pnpm init
pnpm install @prisma/client@6 express dotenv cors helmet bcrypt jsonwebtoken express-validator ws moment-timezone
pnpm install -D prisma@6 nodemon
pnpm install prisma@6 @prisma/client@6 --save-dev
npx prisma init --datasource-provider MySQL
pnpm prisma migrate dev --name init_schema	
pnpm prisma generate
```
### Frontend
```bash
cd frontend
pnpm create vite frontend --template react
pnpm install react-router-dom axios lucide-react
pnpm install jwt-decode
pnpm install axios react-router-dom jwt-decode lucide-react moment
pnpm install tailwindcss @tailwindcss/vite
```
### Project Setup
```bash
.env setup as env.example

cd backend
pnpm install
pnpm prisma migrate dev --name init_schema
pnpm prisma generate

cd fronend
pnpm install
```
### DB Sample Data
```bash
pnpm prisma db push
pnpm prisma:seed

HR : hr.manager@company.com	Password123
Worker A : worker.a@company.com	Password123
Worker B : worker.b@company.com	Password123

To delete LeaveRequest table
pnpm prisma:seedclear
```
### Manage Schema DB
```bash
pnpx prisma@6 migrate dev --name add_default_days_to_leavetype
```
### To Run Project
```bash
both backend and frontend using
pnpm dev
```
