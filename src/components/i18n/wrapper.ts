import * as fs from "fs";
import * as path from "path";

import { Component } from "inversify-components";
import { componentInterfaces } from "./component-interfaces";
import { Configuration } from "./private-interfaces";

import * as i18next from "i18next";
import * as i18nextBackend from "i18next-sync-fs-backend";
import { inject, injectable, multiInject, optional } from "inversify";
import { injectionNames } from "../../injection-names";
import { Logger } from "../root/public-interfaces";

import * as requireDir from "require-directory";

import { TEMPORARY_INTERPOLATION_END, TEMPORARY_INTERPOLATION_START } from "./interpolation-resolver";
import { arraySplitter, processor } from "./plugins/array-returns-sample.plugin";
import { processor as templateParser } from "./plugins/parse-template-language.plugin";
import { MissingInterpolationExtension } from "./public-interfaces";

@injectable()
export class I18nextWrapper {
  public instance: i18next.I18n;
  private component: Component<Configuration.Runtime>;
  private configuration: Configuration.Runtime;
  private logger: Logger;

  /**
   * @param componentMeta Component meta data
   * @param returnOnlySample If set to true, translation calls return a sample out of many options (for production), if false, you get all options (for specs only)
   */
  constructor(
    @inject("meta:component//core:i18n") componentMeta: Component<Configuration.Runtime>,
    @inject(injectionNames.logger) logger: Logger,
    returnOnlySample = true
  ) {
    this.component = componentMeta;
    this.configuration = componentMeta.configuration;
    this.logger = logger;

    if (typeof this.configuration.i18nextAdditionalConfiguration === "undefined" || this.configuration.i18nextAdditionalConfiguration === "undefined") {
      throw new Error("i18next configuration and instance must not be undefined! Please check your configuration.");
    }

    this.instance = Object.assign(Object.create(Object.getPrototypeOf(this.configuration.i18nextInstance)), this.configuration.i18nextInstance);

    let resourcesFromLocalesDir: any;
    if (this.component.configuration.localesDir) {
      resourcesFromLocalesDir = I18nextWrapper.requireDir(this.component.configuration.localesDir);
    }

    const i18nextConfiguration = {
      ...(resourcesFromLocalesDir !== undefined ? { resources: resourcesFromLocalesDir } : {}),
      ...{ initImmediate: false, missingInterpolationHandler: this.onInterpolationMissing.bind(this) },
      ...this.configuration.i18nextAdditionalConfiguration,
    };

    if (typeof i18nextConfiguration.postProcess === "string") {
      i18nextConfiguration.postProcess = [i18nextConfiguration.postProcess];
    } else if (typeof i18nextConfiguration.postProcess === "undefined") {
      i18nextConfiguration.postProcess = [];
    }

    // Tell I18next to join arrays by a join string
    i18nextConfiguration.joinArrays = arraySplitter;

    // 1) Grab a sample from all translation entries in array syntax
    if (returnOnlySample) i18nextConfiguration.postProcess.push("arrayReturnsSample");

    // 2) Parse this sample -> create a new array with all variants
    i18nextConfiguration.postProcess.push("parseTemplateLanguage");

    // 3) Grab a sample from the array of variants
    if (returnOnlySample) i18nextConfiguration.postProcess.push("arrayReturnsSample");

    this.instance
      .use(i18nextBackend)
      .use(templateParser)
      .use(processor)
      .init(i18nextConfiguration, err => {
        if (err) throw err;
      });
  }

  /**
   * handles missing interpolation in translation.js
   * @param str the whole translation-string which contains a missing interpolation, e.g. 'hello {{firstName}}'
   * @param match array of the interpolation that is missing (as strings); first value is the missing value including separators, second is the plain value (e.g. ['{{firstName}}', 'firstName'])
   */
  private onInterpolationMissing(str: string, match: [string, string]) {
    this.logger.debug(`AssistantJS TranslateHelper's onInterpolationMissing callback was called. Missing interpolation = '${match[0]}'`);
    return match[0].replace("{{", TEMPORARY_INTERPOLATION_START).replace("}}", TEMPORARY_INTERPOLATION_END);
  }

  /**
   * Returns camelcase of input string
   */
  private static camelcase(input: string) {
    return input.replace(/[\-]+([a-s])/gi, (m, c) => c.toUpperCase());
  }

  /**
   * Recursively requires locales from a given directory
   */
  private static requireDir(p: string) {
    const absolutPath = path.isAbsolute(p) ? p : path.join(process.cwd(), p);

    return requireDir(module, path.relative(__dirname, absolutPath), {
      extensions: ["ts", "js", "json"],
      visit: (obj, filepath, fn) => {
        let result = obj.default || obj[I18nextWrapper.camelcase(path.basename(fn, path.extname(fn)))];

        // If there's a directory with the same name as the file, it's merged but can be overridden by the current file
        const filenameAsDirname = path.join(path.dirname(filepath), path.basename(filepath, path.extname(__filename)));
        if (fs.existsSync(filenameAsDirname) && fs.statSync(filenameAsDirname).isDirectory()) {
          result = { ...I18nextWrapper.requireDir(filenameAsDirname), ...result };
        }

        // Extract only one object from the module: either that one with the camelcase filename as the file or default
        return result;
      },
      rename: fn => {
        return I18nextWrapper.camelcase(fn);
      },
    });
  }
}
