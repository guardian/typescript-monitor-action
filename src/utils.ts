import fs from "fs";
import { exec } from '@actions/exec';

export function stringToBool(booleanString: string) {
  if (booleanString === 'true') {
    return true;
  }
  return false;
}

export async function safeAccess(filePath: string) {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		return true;
	} catch (e) {}
	return false;
}

export async function execWithOutput(command: string, args: string[] = []) {
	let output = '';
	
	const options = {
		silent: true,
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				output += data.toString();
			}
		},
	};
	
	try {
		await exec(command, args, options);
	} catch (error) {}
	
	return output;
}