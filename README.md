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
pnpm install recharts
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
Add column default_days
pnpx prisma@6 migrate dev --name add_default_days_to_leavetype
Add column attachment
pnpx prisma@6 migrate dev --name add_attachment_to_leave
Add column carried_over_days
pnpx prisma@6 migrate dev --name add_carried_over_days
Add column CrossingYearV3
pnpx prisma@6 migrate dev --name add_Quota_type_Leave_Quota
Add Polyci
pnpx prisma@6 migrate dev --name add_attendance_policy
Add LeaveType Color for HR Dashboard (Report Tabs)
pnpx prisma@6 migrate dev --name add_color_to_leavetype
Add Audit Log
pnpx prisma@6 migrate dev --name audit_log
Add leave gap and holiday config
pnpx prisma@6 migrate dev --name add_leave_gap_and_holidays
Add Employee Profile Update
pnpx prisma@6 migrate dev --name profile_request
Add Fixed change profile notif status
pnpx prisma@6 migrate dev --name profile_status
Add Break Policy
pnpx prisma@6 migrate dev --name break_policy
```
### To Run Project
```bash
both backend and frontend using
pnpm dev
```
