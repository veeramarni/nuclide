/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 */

import type {BuckBuildSystem} from '../../nuclide-buck/lib/BuckBuildSystem';
import type {Device, PlatformGroup, TaskType} from '../../nuclide-buck/lib/types';
import type {TaskEvent} from '../../commons-node/tasks';
import type {PlatformService} from '../../nuclide-buck/lib/PlatformService';
import type {ResolvedBuildTarget} from '../../nuclide-buck-rpc/lib/BuckService';

import {Disposable} from 'atom';
import {Observable} from 'rxjs';
import * as IosSimulator from '../../nuclide-ios-common';
import invariant from 'assert';

let disposable: ?Disposable = null;

const RUNNABLE_RULE_TYPES = new Set([
  'apple_bundle',
]);

const SUPPORTED_RULE_TYPES = new Set([
  ...RUNNABLE_RULE_TYPES,
  'apple_test',
]);

export function deactivate(): void {
  if (disposable != null) {
    disposable.dispose();
    disposable = null;
  }
}

export function consumePlatformService(service: PlatformService): void {
  disposable = service.register(provideIosDevices);
}

function provideIosDevices(
  buckRoot: string,
  ruleType: string,
  buildTarget: string,
): Observable<?PlatformGroup> {
  if (!SUPPORTED_RULE_TYPES.has(ruleType)) {
    return Observable.of(null);
  }

  return IosSimulator.getFbsimctlSimulators().map(simulators => {
    if (!simulators.length) {
      return null;
    }

    return {
      name: 'iOS Simulators',
      platforms: [{
        name: 'iOS Simulators',
        tasks: getTasks(ruleType),
        runTask: (builder, taskType, target, device) =>
          _runTask(builder, taskType, ruleType, target, device),
        deviceGroups: [
          {
            name: 'iOS Simulators',
            devices: simulators.map(simulator => ({
              name: `${simulator.name} (${simulator.os})`,
              udid: simulator.udid,
              arch: simulator.arch,
            })),
          },
        ],
      }],
    };
  });
}

function getTasks(ruleType: string): Set<TaskType> {
  const tasks = new Set(['build', 'test', 'debug']);
  if (RUNNABLE_RULE_TYPES.has(ruleType)) {
    tasks.add('run');
  }
  return tasks;
}

function _runTask(
  builder: BuckBuildSystem,
  taskType: TaskType,
  ruleType: string,
  buildTarget: ResolvedBuildTarget,
  device: ?Device,
): Observable<TaskEvent> {
  invariant(device);
  invariant(device.arch);
  invariant(device.udid);
  const udid = device.udid;
  const arch = device.arch;
  invariant(typeof arch === 'string');
  invariant(typeof udid === 'string');

  const subcommand = _getSubcommand(taskType, ruleType);
  const flavor = `iphonesimulator-${arch}`;
  const newTarget = {...buildTarget, flavors: buildTarget.flavors.concat([flavor])};

  return builder.runSubcommand(subcommand, newTarget, {}, taskType === 'debug', udid);
}

function _getSubcommand(taskType: TaskType, ruleType: string) {
  if (taskType !== 'run' && taskType !== 'debug') {
    return taskType;
  }
  switch (ruleType) {
    case 'apple_bundle': return 'install';
    case 'apple_test': return 'test';
    default: throw new Error('Unsupported rule type');
  }
}
