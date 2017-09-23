﻿using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DiveLogUploader.Writers {
    public class FileDiveWriter : AsyncDiveWriter {

        protected StreamWriter fileWriter;
        protected JsonWriter writer;
        protected JsonSerializer serializer;

        public FileDiveWriter(string path) {
            fileWriter = new StreamWriter(path, false, Encoding.UTF8);
            writer = new JsonTextWriter(fileWriter);
            serializer = new JsonSerializer();
        }

        public override void Start() {
            if (worker.IsBusy) return;

            writer.WriteStartObject();
            writer.WritePropertyName("ReadTime");
            writer.WriteValue(DateTime.Now);

            writer.WritePropertyName("Device");
            serializer.Serialize(writer, device);

            writer.WritePropertyName("Dives");
            writer.WriteStartArray();

            base.Start();
        }

        public override void End() {
            base.End();

            writer.WriteEndArray();
            writer.WriteEndObject();

            writer.Close();
            fileWriter.Close();
        }

        protected override void ProcessDive(Dive dive) {
            serializer.Serialize(writer, dive);
        }

    }
}
