import { Role } from '../common/enums';

export interface JwtPayload {
  sub: string; // user id
  employeeNo: string;
  role: Role;
}

export interface AuthenticatedUser {
  id: string;
  employeeNo: string;
  name: string;
  department: string;
  email: string;
  role: Role;
  isPartner: boolean;
}
