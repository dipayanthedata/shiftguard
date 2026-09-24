#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ShiftGuardStack } from '../lib/shiftguard-stack';

const app = new cdk.App();

new ShiftGuardStack(app, 'ShiftGuardStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  },
});
